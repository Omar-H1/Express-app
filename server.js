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

const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
const dbName = process.env.DB_NAME || 'afterschool';
let db;
let inMemoryCart = { userId: new ObjectId('507f1f77bcf86cd799439011'), items: [] };

async function connectDB() {
  try {
    await client.connect();
    db = client.db(dbName);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    // For demo purposes, use in-memory data if MongoDB fails
    console.log('Using in-memory data for demo');
    db = {
      collection: (name) => ({
        find: () => ({
          toArray: async () => sampleLessons,
          sort: () => ({
            toArray: async () => sampleLessons.sort((a, b) => a.subject.localeCompare(b.subject))
          })
        }),
        findOne: async (query) => {
          if (query._id) {
            return sampleLessons.find(l => l._id === query._id.$oid || l._id === query._id.toString() || l._id === query._id);
          }
          if (query.userId) {
            return inMemoryCart;
          }
          return null;
        },
        updateOne: async (filter, update, options) => {
          // Simulate update for cart
          if (filter.userId && update.$set && update.$set.items) {
            inMemoryCart.items = update.$set.items;
            return { acknowledged: true };
          }
          // Simulate update for lessons (decrement spaces)
          if (filter._id && update.$inc && update.$inc.spaces !== undefined) {
            const lesson = sampleLessons.find(l => l._id === filter._id.toString());
            if (lesson) {
              lesson.spaces += update.$inc.spaces;
            }
            return { acknowledged: true };
          }
          return {};
        },
        insertOne: async () => ({ insertedId: 'demo-id' }),
        countDocuments: async () => sampleLessons.length,
        listIndexes: async () => ({ toArray: async () => [] }),
        createIndex: async () => {}
      })
    };
  }
}

await connectDB();

const sampleLessons = [
  { _id: 'lesson1', subject: 'Math Fundamentals', location: 'London', price: 20, spaces: 10, icon: 'fa-solid fa-square-root-variable' },
  { _id: 'lesson2', subject: 'English Literature', location: 'London', price: 25, spaces: 10, icon: 'fa-solid fa-book' },
  { _id: 'lesson3', subject: 'Science Basics', location: 'London', price: 18, spaces: 10, icon: 'fa-solid fa-flask' },
  { _id: 'lesson4', subject: 'History Studies', location: 'London', price: 22, spaces: 10, icon: 'fa-solid fa-landmark' },
  { _id: 'lesson5', subject: 'Art and Design', location: 'London', price: 30, spaces: 10, icon: 'fa-solid fa-palette' },
  { _id: 'lesson6', subject: 'Computer Programming', location: 'London', price: 35, spaces: 10, icon: 'fa-solid fa-code' },
  { _id: 'lesson7', subject: 'Music Theory', location: 'London', price: 28, spaces: 10, icon: 'fa-solid fa-music' },
  { _id: 'lesson8', subject: 'Physical Education', location: 'London', price: 15, spaces: 10, icon: 'fa-solid fa-running' },
  { _id: 'lesson9', subject: 'Geography', location: 'London', price: 20, spaces: 10, icon: 'fa-solid fa-globe' },
  { _id: 'lesson10', subject: 'Foreign Languages', location: 'London', price: 27, spaces: 10, icon: 'fa-solid fa-language' }
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
    if (lessonsCollection.listIndexes) {
      const indexes = await lessonsCollection.listIndexes().toArray();
      const hasTextIndex = indexes.some(index => index.name === 'subject_text_location_text' || index.name === 'topic_text_location_text');
      if (!hasTextIndex) {
        await lessonsCollection.createIndex({ subject: 'text', location: 'text' }, { name: 'subject_text_location_text' });
        console.log('Created text index');
      }
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
    // For demo purposes, use a fixed user ID since auth is removed
    const userId = new ObjectId('507f1f77bcf86cd799439011'); // Fixed demo user ID
    const orders = await db.collection('order').find({ userId }).sort({ createdAt: -1 }).toArray();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/cart', async (req, res) => {
  try {
    // For demo purposes, use a fixed user ID since auth is removed
    const userId = new ObjectId('507f1f77bcf86cd799439011'); // Fixed demo user ID
    const cart = await db.collection('cart').findOne({ userId });
    res.json(cart ? cart.items : []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

app.post('/cart/add', async (req, res) => {
  try {
    // For demo purposes, use a fixed user ID since auth is removed
    const userId = new ObjectId('507f1f77bcf86cd799439011'); // Fixed demo user ID
    const { lessonId, qty } = req.body;
    if (!lessonId || !qty) return res.status(400).json({ error: 'Lesson ID and quantity required' });
    const lesson = await db.collection('lesson').findOne({ _id: lessonId });
    if (!lesson || lesson.spaces < qty) return res.status(400).json({ error: 'Lesson not available or insufficient spaces' });
    const cartCollection = db.collection('cart');
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
    // Decrement lesson spaces
    await db.collection('lesson').updateOne({ _id: lessonId }, { $inc: { spaces: -qty } });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

app.post('/cart/remove', async (req, res) => {
  try {
    // For demo purposes, use a fixed user ID since auth is removed
    const userId = new ObjectId('507f1f77bcf86cd799439011'); // Fixed demo user ID
    const { lessonId } = req.body;
    if (!lessonId) return res.status(400).json({ error: 'Lesson ID required' });
    const cartCollection = db.collection('cart');
    const cart = await cartCollection.findOne({ userId });
    if (cart) {
      cart.items = cart.items.filter(item => item._id !== lessonId);
      await cartCollection.updateOne({ userId }, { $set: { items: cart.items } });
    }
    res.json({ ok: true });
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
    // For demo purposes, use a fixed user ID since auth is removed
    const userId = new ObjectId('507f1f77bcf86cd799439011'); // Fixed demo user ID
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
      userId,
      name,
      phone,
      items,
      total,
      createdAt: new Date().toISOString()
    };
    const result = await db.collection('order').insertOne(order);
    res.json({ ok: true, orderId: result.insertedId });
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
