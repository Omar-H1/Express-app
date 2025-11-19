import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(cors());

// Serve static files from the Vue app directory
app.use(express.static(path.resolve(__dirname, '../vue-app')));

const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
const dbName = process.env.DB_NAME || 'afterschool';
let db;
let inMemoryCart = { userId: new ObjectId('507f1f77bcf86cd799439011'), items: [] };

const sampleLessons = [
  { _id: new ObjectId('69122bfeabae0cc1bdee6992'), subject: 'art', location: 'A 12', price: 5, spaces: 10, image: 'Art.jpg' },
  { _id: new ObjectId('69122bfeabae0cc1bdee6993'), subject: 'coding', location: 'B 07', price: 10, spaces: 10, image: 'Coding.jpg' },
  { _id: new ObjectId('69122bfeabae0cc1bdee6994'), subject: 'dance', location: 'C 15', price: 15, spaces: 10, image: 'Dance.jpg' },
  { _id: new ObjectId('69122bfeabae0cc1bdee6995'), subject: 'drama', location: 'D 22', price: 20, spaces: 10, image: 'Drama.jpg' },
  { _id: new ObjectId('69122bfeabae0cc1bdee698e'), subject: 'english', location: 'E 03', price: 25, spaces: 10, image: 'English.jpg' },
  { _id: new ObjectId('69122bfeabae0cc1bdee6990'), subject: 'history', location: 'F 18', price: 5, spaces: 10, image: 'History.jpg' },
  { _id: new ObjectId('69122bfeabae0cc1bdee698d'), subject: 'math', location: 'G 09', price: 10, spaces: 10, image: 'Math.jpg' },
  { _id: new ObjectId('69122bfeabae0cc1bdee6991'), subject: 'music', location: 'H 14', price: 15, spaces: 10, image: 'Music.jpg' },
  { _id: new ObjectId('69122bfeabae0cc1bdee698f'), subject: 'science', location: 'I 21', price: 20, spaces: 10, image: 'Science.jpg' },
  { _id: new ObjectId('69122bfeabae0cc1bdee6996'), subject: 'sports', location: 'J 06', price: 25, spaces: 10, image: 'Sports.jpg' }
];

// Function to connect to the database
async function connectDB() {
  console.log('Using in-memory data for demo');
  db = {
    collection: (name) => ({
      find: () => ({
        toArray: async () => [...sampleLessons],
        sort: (criteria) => ({
          toArray: async () => {
            const sorted = [...sampleLessons].sort((a, b) => a.subject.localeCompare(b.subject));
            return sorted;
          }
        })
      }),
      findOne: async (query) => {
        if (query._id) {
          const id = typeof query._id === 'string' ? new ObjectId(query._id) : query._id;
          return sampleLessons.find(l => l._id.equals(id));
        }
        if (query.userId) {
          return inMemoryCart;
        }
        return null;
      },
      updateOne: async (filter, update, options) => {
        if (filter.userId && update.$set && update.$set.items) {
          inMemoryCart.items = update.$set.items;
          return { acknowledged: true };
        }
        if (filter._id && update.$inc && update.$inc.spaces !== undefined) {
          const lesson = sampleLessons.find(l => l._id.equals(filter._id));
          if (lesson) {
            lesson.spaces += update.$inc.spaces;
          }
          return { acknowledged: true };
        }
        return {};
      },
      updateMany: async (filter, update, options) => {
        if (update.$set && update.$set.spaces !== undefined) {
          sampleLessons.forEach(lesson => lesson.spaces = update.$set.spaces);
          return { acknowledged: true };
        }
        return {};
      },
      insertOne: async (doc) => {
        return { insertedId: 'demo-order-id' };
      },
      deleteOne: async (filter) => {
        if (filter.lessonId && filter.userId) {
          inMemoryCart.items = inMemoryCart.items.filter(item => item._id !== filter.lessonId.toString());
        }
        return { acknowledged: true };
      },
      countDocuments: async () => sampleLessons.length,
      listIndexes: async () => ({ toArray: async () => [] }),
      createIndex: async () => {}
    })
  };
}

await connectDB();

// Function to rename fields in the database
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

// Function to seed the database with sample lessons
async function seedDB() {
  try {
    const lessonsCollection = db.collection('lesson');
    const existingLessons = await lessonsCollection.countDocuments();
    if (existingLessons === 0) {
      await lessonsCollection.insertMany(sampleLessons);
      console.log('Seeded 10 sample lessons');
    } else {
      await lessonsCollection.updateMany({}, { $set: { spaces: 10 } });
      console.log('Reset spaces to 10 for all lessons');
    }
  } catch (error) {
    console.error('Seeding error:', error);
  }
}

// Function to create indexes for the database
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

// Route to get all lessons
app.get('/lessons', async (req, res) => {
  try {
    const lessons = await db.collection('lesson').find({}).sort({ subject: 1 }).toArray();
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// Route to get a specific lesson by ID
app.get('/lessons/:id', async (req, res) => {
  try {
    const lesson = await db.collection('lesson').findOne({ _id: new ObjectId(req.params.id) });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json(lesson);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lesson' });
  }
});

// Route to search lessons
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

// Route to get orders
app.get('/orders', async (req, res) => {
  try {
    const userId = new ObjectId('507f1f77bcf86cd799439011');
    const orders = await db.collection('order').find({ userId }).sort({ createdAt: -1 }).toArray();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Route to get cart items
app.get('/cart', async (req, res) => {
  try {
    const userId = new ObjectId('507f1f77bcf86cd799439011');
    const cart = await db.collection('cart').findOne({ userId });
    res.json(cart ? cart.items : []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// Route to add item to cart
app.post('/cart/add', async (req, res) => {
  try {
    const userId = new ObjectId('507f1f77bcf86cd799439011');
    const { lessonId, qty } = req.body;
    if (!lessonId || !qty) return res.status(400).json({ error: 'Lesson ID and quantity required' });
    const lesson = await db.collection('lesson').findOne({ _id: new ObjectId(lessonId) });
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
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

// Route to remove item from cart
app.post('/cart/remove', async (req, res) => {
  try {
    const userId = new ObjectId('507f1f77bcf86cd799439011');
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

// Route to create an order
app.post('/orders', async (req, res) => {
  try {
    const userId = new ObjectId('507f1f77bcf86cd799439011');
    const { name, phone, paymentMethod, cardNumber, cardName, expiryDate, securityCode, items } = req.body;
    if (!name || !phone || !paymentMethod || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Invalid order data' });
    }
    const nameRegex = /^[a-zA-Z\s]+$/;
    const phoneRegex = /^\d{10,}$/;
    if (!nameRegex.test(name) || !phoneRegex.test(phone)) {
      return res.status(400).json({ error: 'Invalid name or phone (phone must be at least 10 digits)' });
    }
    if (paymentMethod === 'online') {
      const cardNumberRegex = /^\d{16}$/;
      const cardNameRegex = /^[a-zA-Z\s]+$/;
      const expiryDateRegex = /^\d{2}\/\d{2}$/;
      const securityCodeRegex = /^\d{3}$/;
      if (!cardNumberRegex.test(cardNumber) || !cardNameRegex.test(cardName) || !expiryDateRegex.test(expiryDate) || !securityCodeRegex.test(securityCode)) {
        return res.status(400).json({ error: 'Invalid card details' });
      }
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
      paymentMethod,
      items,
      total,
      createdAt: new Date().toISOString()
    };
    if (paymentMethod === 'online') {
      order.cardNumber = cardNumber;
      order.cardName = cardName;
      order.expiryDate = expiryDate;
      order.securityCode = securityCode;
    }
    const result = await db.collection('order').insertOne(order);
    const cartCollection = db.collection('cart');
    let cart = await cartCollection.findOne({ userId });
    if (cart) {
      cart.items = cart.items.filter(cartItem => !items.some(orderedItem => orderedItem.lessonId === cartItem._id.toString()));
      await cartCollection.updateOne({ userId }, { $set: { items: cart.items } });
    }
    res.json({ ok: true, orderId: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: 'Order creation failed' });
  }
});

// Catch-all handler: send back index.html for any non-API routes to support SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../vue-app/index.html'));
});

const port = process.env.PORT || 8080;
app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  await renameFields();
  await createIndexes();
  await seedDB();
  await resetSpaces();
  await resetCart();
});

// Function to reset spaces to 10 for all lessons
async function resetSpaces() {
  try {
    const lessonsCollection = db.collection('lesson');
    await lessonsCollection.updateMany({}, { $set: { spaces: 10 } });
    console.log('Reset spaces to 10 for all lessons');
  } catch (error) {
    console.error('Reset spaces error:', error);
  }
}

// Function to reset cart
async function resetCart() {
  try {
    const cartCollection = db.collection('cart');
    await cartCollection.deleteMany({});
    console.log('Reset cart');
  } catch (error) {
    console.error('Reset cart error:', error);
  }
}
