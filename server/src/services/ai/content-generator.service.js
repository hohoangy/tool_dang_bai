import axios from 'axios';
import { env } from '../../config/env.js';

const tonePresets = {
  viral: 'năng lượng cao, dễ dừng lướt, ngắn gọn',
  storytelling: 'gần gũi, có câu chuyện, rõ cảm xúc',
  inspirational: 'ấm áp, thực tế, truyền cảm hứng',
  professional: 'rõ ràng, đáng tin, chuyên gia',
  casual: 'thân thiện, đơn giản, trực tiếp'
};

function demoContent({ topic, tone, platform }, index = 0) {
  const style = tonePresets[tone] || tonePresets.viral;
  const platformLabel = platform === 'x' ? 'X' : platform;

  return {
    title: `${topic} - Ý tưởng ${platformLabel} ${index + 1}`,
    topic,
    tone,
    platform,
    content: {
      hook: `Dừng lướt: ${topic} có thể đơn giản hơn bạn nghĩ.`,
      caption:
        `Phần lớn nhà sáng tạo đang làm ${topic} phức tạp hơn cần thiết. Cách đơn giản là biến một ý tưởng rõ ràng thành bài viết hữu ích: bắt đầu từ nỗi đau, chỉ ra thay đổi, rồi đưa một hành động người đọc có thể làm ngay hôm nay. Giọng văn: ${style}.`,
      hashtags: ['#CreatorTools', '#SocialMedia', '#AIContent', `#${topic.replace(/\s+/g, '')}`].slice(0, 4),
      cta: 'Lưu lại và lên lịch bài viết tiếp theo trước khi hết ngày.',
      outline: [
        'Mở đầu bằng một nỗi đau cụ thể',
        'Chia sẻ góc nhìn trước/sau thật thực tế',
        'Kết thúc bằng một hành động dễ làm'
      ]
    }
  };
}

export async function generateContent(payload) {
  const count = Math.min(Number(payload.count || 1), 10);

  if (env.aiProvider !== 'openai' || !env.openAiApiKey) {
    return Array.from({ length: count }, (_, index) => demoContent(payload, index));
  }

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Return JSON with an items array. Each item has title, topic, tone, platform, content {hook, caption, hashtags, cta, outline}.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Generate social media content for a creator.',
            requirements: ['3-second hook', 'caption', 'hashtags', 'CTA', 'viral/storytelling/inspirational ready'],
            ...payload,
            count
          })
        }
      ]
    },
    { headers: { Authorization: `Bearer ${env.openAiApiKey}` } }
  );

  return JSON.parse(response.data.choices[0].message.content).items;
}
