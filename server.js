import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Serve static files from the vue-app directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, '../vue-app'), { index: 'index.html' }));

const client = new MongoClient(process.env.MONGODB_URI);
const dbName = process.env.DB_NAME;
let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db(dbName);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
}

await connectDB();

const sampleLessons = [
  { subject: 'Math Fundamentals', location: 'London', price: 20, spaces: 5, icon: 'fa-solid fa-square-root-variable' },
  { subject: 'English Literature', location: 'Manchester', price: 25, spaces: 3, icon: 'fa-solid fa-book' },
  { subject: 'Science Basics', location: 'Birmingham', price: 18, spaces: 7, icon: 'fa-solid fa-flask' },
  { subject: 'History Studies', location: 'Leeds', price: 22, spaces: 4, icon: 'fa-solid fa-landmark' },
  { subject: 'Art and Design', location: 'Liverpool', price: 30, spaces: 2, icon: 'fa-solid fa-palette' },
  { subject: 'Computer Programming', location: 'Newcastle', price: 35, spaces: 6, icon: 'fa-solid fa-code' },
  { subject: 'Music Theory', location: 'Sheffield', price: 28, spaces: 3, icon: 'fa-solid fa-music' },
  { subject: 'Physical Education', location: 'Bristol', price: 15, spaces: 8, icon: 'fa-solid fa-running' },
  { subject: 'Geography', location: 'Nottingham', price: 20, spaces: 5, icon: 'fa-solid fa-globe' },
  { subject: 'Foreign Languages', location: 'Cardiff', price: 27, spaces: 4, icon: 'fa-solid fa-language' }
];

async function renameFields() {
  try {
    const lessonsCollection = db.collection('lesson');
    const lessons = await lessonsCollection.find({}).toArray();
    for (const lesson of lessons) {
      if (lesson.topic && !lesson.subject) {
        await lessonsCollection.updateOne(
          { _id: lesson._id },
          { $rename: { topic: 'subject', space: 'spaces' } }
        );
      }
    }
    console.log('Renamed fields topic to subject and space to spaces');
  } catch (error) {
    console.error('Rename error:', error);
  }
}

async function seedDB() {
  try {
    const lessonsCollection = db.collection('lesson');
    const existingLessons = await lessonsCollection.countDocuments();
    if (existingLessons === 0) {
      await lessonsCollection.insertMany(sampleLessons);
      console.log('Seeded 10 sample lessons');
    } else {
      console.log('Lessons already exist, skipping seed');
    }

    const usersCollection = db.collection('users');
    const hashedPassword = await bcrypt.hash('password', 10);
    await usersCollection.updateOne(
      { user: 'M00123456' },
      { $set: { password: hashedPassword } },
      { upsert: true }
    );
    console.log('Seeded/updated user: M00123456');
  } catch (error) {
    console.error('Seeding error:', error);
  }
}

async function createIndexes() {
  try {
    const lessonsCollection = db.collection('lesson');
    const indexes = await lessonsCollection.listIndexes().toArray();
    const hasTextIndex = indexes.some(index => index.name === 'subject_text_location_text' || index.name === 'topic_text_location_text');
    if (!hasTextIndex) {
      await lessonsCollection.createIndex({ subject: 'text', location: 'text' }, { name: 'subject_text_location_text' });
      console.log('Created text index');
    }
  } catch (error) {
    console.error('Index creation error:', error);
  }
}



app.get('/lessons', async (req, res) => {
  try {
    const lessons = await db.collection('lesson').find({}).sort({ subject: 1 }).toArray();
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

app.get('/lessons/:id', async (req, res) => {
  try {
    const lesson = await db.collection('lesson').findOne({ _id: new ObjectId(req.params.id) });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json(lesson);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

app.get('/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json([]);
    const allLessons = await db.collection('lesson').find({}).toArray();
    const filteredLessons = allLessons.filter(lesson =>
      lesson.subject.toLowerCase().includes(q.toLowerCase()) ||
      lesson.location.toLowerCase().includes(q.toLowerCase()) ||
      lesson.price.toString().includes(q) ||
      lesson.spaces.toString().includes(q)
    );
    res.json(filteredLessons);
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/orders', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.substring(7);
    jwt.verify(token, process.env.JWT_SECRET || 'secret', async (err, decoded) => {
      if (err) return res.status(401).json({ error: 'Invalid token' });
      const orders = await db.collection('order').find({ userId: new ObjectId(decoded.userId) }).sort({ createdAt: -1 }).toArray();
      res.json(orders);
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/cart', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.substring(7);
    jwt.verify(token, process.env.JWT_SECRET || 'secret', async (err, decoded) => {
      if (err) return res.status(401).json({ error: 'Invalid token' });
      const cart = await db.collection('cart').findOne({ userId: new ObjectId(decoded.userId) });
      res.json(cart ? cart.items : []);
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

app.post('/cart/add', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.substring(7);
    jwt.verify(token, process.env.JWT_SECRET || 'secret', async (err, decoded) => {
      if (err) return res.status(401).json({ error: 'Invalid token' });
      const { lessonId, qty } = req.body;
      if (!lessonId || !qty) return res.status(400).json({ error: 'Lesson ID and quantity required' });
      const lesson = await db.collection('lesson').findOne({ _id: new ObjectId(lessonId) });
      if (!lesson || lesson.spaces < qty) return res.status(400).json({ error: 'Lesson not available or insufficient spaces' });
      const cartCollection = db.collection('cart');
      const userId = new ObjectId(decoded.userId);
      let cart = await cartCollection.findOne({ userId });
      if (!cart) {
        cart = { userId, items: [] };
      }
      const existingItem = cart.items.find(item => item._id === lessonId);
      if (existingItem) {
        existingItem.qty += qty;
      } else {
        cart.items.push({ _id: lessonId, subject: lesson.subject, price: lesson.price, qty });
      }
      await cartCollection.updateOne({ userId }, { $set: { items: cart.items } }, { upsert: true });
      res.json({ ok: true });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

app.post('/cart/remove', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.substring(7);
    jwt.verify(token, process.env.JWT_SECRET || 'secret', async (err, decoded) => {
      if (err) return res.status(401).json({ error: 'Invalid token' });
      const { lessonId } = req.body;
      if (!lessonId) return res.status(400).json({ error: 'Lesson ID required' });
      const cartCollection = db.collection('cart');
      const userId = new ObjectId(decoded.userId);
      const cart = await cartCollection.findOne({ userId });
      if (cart) {
        cart.items = cart.items.filter(item => item._id !== lessonId);
        await cartCollection.updateOne({ userId }, { $set: { items: cart.items } });
      }
      res.json({ ok: true });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove from cart' });
  }
});



app.post('/login', async (req, res) => {
  try {
    const { user, password } = req.body;
    if (!user || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const idRegex = /^M\d{8}$/;
    if (!idRegex.test(user)) {
      return res.status(400).json({ error: 'Invalid student ID format' });
    }
    const userDoc = await db.collection('users').findOne({ user });
    if (!userDoc) {
      return res.status(401).json({ error: 'Student ID or password wrong' });
    }
    const isValid = await bcrypt.compare(password, userDoc.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Student ID or password wrong' });
    }
    const token = jwt.sign({ userId: userDoc._id, user: userDoc.user }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });
    res.json({ ok: true, token });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/orders', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.substring(7);
    jwt.verify(token, process.env.JWT_SECRET || 'secret', async (err, decoded) => {
      if (err) return res.status(401).json({ error: 'Invalid token' });
      const { name, phone, items } = req.body;
      if (!name || !phone || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Invalid order data' });
      }
      const nameRegex = /^[a-zA-Z\s]+$/;
      const phoneRegex = /^\d{10,}$/;
      if (!nameRegex.test(name) || !phoneRegex.test(phone)) {
        return res.status(400).json({ error: 'Invalid name or phone (phone must be at least 10 digits)' });
      }
      let total = 0;
      for (const item of items) {
        const lesson = await db.collection('lesson').findOne({ _id: new ObjectId(item.lessonId) });
        if (!lesson) return res.status(400).json({ error: 'Lesson not found' });
        if (lesson.spaces < item.qty) return res.status(400).json({ error: 'Not enough spaces' });
        total += lesson.price * item.qty;
        await db.collection('lesson').updateOne({ _id: new ObjectId(item.lessonId) }, { $inc: { spaces: -item.qty } });
      }
      const order = {
        userId: new ObjectId(decoded.userId),
        name,
        phone,
        items,
        total,
        createdAt: new Date().toISOString()
      };
      const result = await db.collection('order').insertOne(order);
      res.json({ ok: true, orderId: result.insertedId });
    });
  } catch (error) {
    res.status(500).json({ error: 'Order creation failed' });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  await renameFields();
  await createIndexes();
  if (process.argv.includes('--seed')) {
    await seedDB();
  }
});
