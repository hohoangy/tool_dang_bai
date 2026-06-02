<script setup>
defineProps({ columns: Array, rows: Array });
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
    <table class="w-full min-w-[720px] text-left text-sm">
      <thead class="bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
        <tr>
          <th v-for="column in columns" :key="column.key" class="px-4 py-3 font-semibold">{{ column.label }}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <tr v-for="row in rows" :key="row._id" class="bg-white dark:bg-zinc-950">
          <td v-for="column in columns" :key="column.key" class="px-4 py-4">
            <slot :name="column.key" :row="row">{{ row[column.key] }}</slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
