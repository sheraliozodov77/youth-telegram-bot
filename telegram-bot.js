import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

dotenv.config();

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pinecone.index(process.env.PINECONE_INDEX_NAME);

app.post('/telegram', async (req, res) => {
  try {
    const message = req.body?.message?.text;
    const chatId = req.body?.message?.chat?.id;
    if (!message || !chatId) return res.sendStatus(200);

    let replyText = '';

    if (message === '/start') {
      replyText = '👋 Salom! Savolingizni yuboring — men sizga yordam berishga harakat qilaman.';
    } else {
      const embeddingRes = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: message,
      });

      const vector = embeddingRes.data[0].embedding;

      const results = await index.query({
        vector,
        topK: 5,
        includeMetadata: true,
      });

      const context = results.matches.map(m => m.metadata?.text || '').join('\n\n');

      const chatRes = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content:
              'Pastdagi kontekstdan foydalanib foydalanuvchining savoliga o‘zbek tilida aniq va foydali javob yozing. Agar kontekstda javob topilmasa, "Kechirasiz, bu haqda aniq ma’lumot topilmadi" deb yozing.',
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
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: req.body?.message?.chat?.id,
      text: '❌ Xatolik yuz berdi. Iltimos, keyinroq urinib ko‘ring.',
    });
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Telegram bot running at http://localhost:${PORT}/telegram`);
});
