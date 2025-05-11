const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const { Pinecone } = require('@pinecone-database/pinecone');
require('dotenv').config();

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);

const processedMessages = new Set();

app.post('/telegram', async (req, res) => {
  try {
    const messageId = req.body?.message?.message_id;
    const message = req.body?.message?.text;
    const chatId = req.body?.message?.chat?.id;

    if (!message || !chatId || !messageId) return res.sendStatus(200);
    if (processedMessages.has(messageId)) return res.sendStatus(200);
    processedMessages.add(messageId);
    setTimeout(() => processedMessages.delete(messageId), 60 * 1000);

    let replyText = '';

    if (message.trim() === '/start') {
      replyText = '👋 Assalomu alaykum! Men Yoshlar ishlari agentligi uchun mo‘ljallangan yordamchi chatbotman. Savolingizni yozing — men siz uchun kerakli ma’lumotlarni 🔍 topishga harakat qilaman.';
    } else if (message.trim() === '/help') {
      replyText = `🧠 Misol uchun, quyidagicha savollarni berishingiz mumkin:\n\n• Yoshlar agentligida ishga qanday kiriladi?\n• Agentlik qanday loyihalarni qo‘llab-quvvatlaydi?\n• Qanday hujjatlar kerak?\n\nYozing, men yordam berishga tayyorman.`;
    } else {
      const embeddingRes = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: message,
      });

      const vector = embeddingRes.data[0].embedding;

      const results = await index.query({
        vector,
        topK: 8,
        includeMetadata: true,
      });

      const context = results.matches.map((m) => m.metadata?.text || '').join('\n\n');

      const chatRes = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content:
              "Foydalanuvchining savoliga pastdagi kontekstdan foydalanib o‘zbek tilida aniq, foydali va tushunarli javob ber. Faqat kontekstdagi ma’lumotlarga tayangan holda javob ber. Agar savolga bevosita javob topilmasa, tegishli kontekstdan foydalangan holda tushuntir. Agar hech qanday mos ma’lumot topilmasa, iltimos bilan: \"Kechirasiz, kontekstda ushbu savolga oid ma’lumot topilmadi.\" deb javob qaytar.",
          },
          {
            role: 'user',
            content: `Kontekst:\n${context}\n\nSavol: ${message}`,
          },
        ],
        temperature: 0.3,
      });

      replyText = chatRes.choices[0].message.content?.trim() || '❌ Javob topilmadi.';
    }

    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: replyText,
    });

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (req.body?.message?.chat?.id) {
      await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: req.body.message.chat.id,
        text: '❌ Xatolik yuz berdi. Iltimos, keyinroq urinib ko‘ring.',
      });
    }
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Telegram bot running at http://localhost:${PORT}/telegram`);
});
