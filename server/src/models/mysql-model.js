import { randomUUID } from 'crypto';
import { query } from '../config/db.js';

const operators = {
  $in: 'IN',
  $gte: '>=',
  $lte: '<='
};

export class MysqlDocument {
  constructor(model, data) {
    Object.defineProperty(this, '$model', { value: model, enumerable: false });
    Object.assign(this, data);
    this.id = this._id;
  }

  async save() {
    return this.$model.updateDocument(this);
  }

  async deleteOne() {
    return this.$model.deleteById(this._id);
  }

  toJSON() {
    const output = {};
    for (const key of Object.keys(this)) output[key] = this[key];
    return output;
  }
}

class QueryBuilder {
  constructor(model, filter, options = {}) {
    this.model = model;
    this.filter = filter;
    this.single = options.single || false;
    this.sortSpec = null;
    this.limitValue = null;
    this.selectSpec = null;
    this.populateField = null;
  }

  sort(spec) {
    this.sortSpec = spec;
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  select(spec) {
    this.selectSpec = spec;
    return this;
  }

  populate(field) {
    this.populateField = field;
    return this;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }

  async exec() {
    let result = await this.model.select(this.filter, {
      single: this.single,
      sort: this.sortSpec,
      limit: this.limitValue
    });

    if (this.populateField && !this.single) {
      result = await this.model.populate(result, this.populateField);
    }

    result = applySelect(result, this.selectSpec);
    return result;
  }
}

function applySelect(result, spec) {
  if (!spec || !result) return result;
  const exclusions = spec
    .split(/\s+/)
    .filter((item) => item.startsWith('-'))
    .map((item) => item.slice(1));

  const strip = (item) => {
    for (const key of exclusions) delete item[key];
    return item;
  };

  return Array.isArray(result) ? result.map(strip) : strip(result);
}

export function createModel(config) {
  const model = {
    ...config,

    create(data) {
      return this.insertOne(data);
    },

    async insertOne(data) {
      const id = data._id || data.id || randomUUID();
      const now = new Date();
      const normalized = this.normalize({ ...data, _id: id, createdAt: data.createdAt || now, updatedAt: data.updatedAt || now });
      const columns = Object.keys(normalized);
      const placeholders = columns.map(() => '?').join(', ');
      await query(
        `INSERT INTO ${this.table} (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${placeholders})`,
        columns.map((column) => normalized[column])
      );
      return new MysqlDocument(this, this.hydrate(normalized));
    },

    insertMany(items) {
      return Promise.all(items.map((item) => this.insertOne(item)));
    },

    find(filter = {}) {
      return new QueryBuilder(this, filter);
    },

    findOne(filter = {}) {
      return new QueryBuilder(this, filter, { single: true });
    },

    findById(id) {
      return new QueryBuilder(this, { _id: id }, { single: true });
    },

    async countDocuments(filter = {}) {
      const { where, params } = buildWhere(filter, this.fieldMap);
      const rows = await query(`SELECT COUNT(*) AS count FROM ${this.table}${where}`, params);
      return Number(rows[0]?.count || 0);
    },

    async deleteMany(filter = {}) {
      const { where, params } = buildWhere(filter, this.fieldMap);
      return query(`DELETE FROM ${this.table}${where}`, params);
    },

    async findByIdAndUpdate(id, data) {
      const existing = await this.findById(id);
      if (!existing) return null;
      Object.assign(existing, data);
      return existing.save();
    },

    async select(filter = {}, options = {}) {
      const { where, params } = buildWhere(filter, this.fieldMap);
      const orderBy = buildOrder(options.sort, this.fieldMap);
      const limit = options.single ? ' LIMIT 1' : options.limit ? ` LIMIT ${Number(options.limit)}` : '';
      const rows = await query(`SELECT * FROM ${this.table}${where}${orderBy}${limit}`, params);
      const docs = rows.map((row) => new MysqlDocument(this, this.hydrate(row)));
      return options.single ? docs[0] || null : docs;
    },

    async updateDocument(doc) {
      doc.updatedAt = new Date();
      const normalized = this.normalize(doc);
      const columns = Object.keys(normalized).filter((column) => column !== 'id');
      await query(
        `UPDATE ${this.table} SET ${columns.map((column) => `\`${column}\` = ?`).join(', ')} WHERE id = ?`,
        [...columns.map((column) => normalized[column]), doc._id]
      );
      return doc;
    },

    deleteById(id) {
      return query(`DELETE FROM ${this.table} WHERE id = ?`, [id]);
    },

    async populate(rows, field) {
      return rows;
    }
  };

  return model;
}

export function toMysqlDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19).replace('T', ' ');
}

export function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildWhere(filter, fieldMap) {
  const entries = Object.entries(filter || {});
  if (!entries.length) return { where: '', params: [] };

  const clauses = [];
  const params = [];

  for (const [field, value] of entries) {
    const column = fieldMap[field] || field;
    if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
      for (const [operator, operatorValue] of Object.entries(value)) {
        if (operator === '$in') {
          clauses.push(`\`${column}\` IN (${operatorValue.map(() => '?').join(', ')})`);
          params.push(...operatorValue);
        } else if (operators[operator]) {
          clauses.push(`\`${column}\` ${operators[operator]} ?`);
          params.push(formatValue(operatorValue));
        }
      }
    } else {
      clauses.push(`\`${column}\` = ?`);
      params.push(formatValue(value));
    }
  }

  return { where: ` WHERE ${clauses.join(' AND ')}`, params };
}

function buildOrder(sortSpec, fieldMap) {
  if (!sortSpec) return '';
  const entries = Object.entries(sortSpec);
  if (!entries.length) return '';
  const parts = entries.map(([field, direction]) => `\`${fieldMap[field] || field}\` ${direction === -1 ? 'DESC' : 'ASC'}`);
  return ` ORDER BY ${parts.join(', ')}`;
}

function formatValue(value) {
  return value instanceof Date ? toMysqlDate(value) : value;
}
