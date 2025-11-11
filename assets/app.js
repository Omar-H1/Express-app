const { createApp } = Vue;
const { createRouter, createWebHashHistory } = VueRouter;

const LoginComponent = {
  template: `
    <div class="container mt-5">
      <div class="row justify-content-center">
        <div class="col-md-6">
          <h2 class="text-center mb-4">Login</h2>
          <form @submit.prevent="login">
            <div class="mb-3">
              <label for="user" class="form-label">Student ID</label>
              <input type="text" id="user" v-model="loginForm.user" class="form-control" required placeholder="e.g. M00123456">
            </div>
            <div class="mb-3">
              <label for="password" class="form-label">Password</label>
              <input type="password" id="password" v-model="loginForm.password" class="form-control" required>
            </div>
            <button type="submit" class="btn btn-primary w-100">Login</button>
            <div v-if="loginError" class="alert alert-danger mt-3">{{ loginError }}</div>
          </form>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      loginForm: {
        user: '',
        password: ''
      },
      loginError: ''
    };
  },
  methods: {
    async login() {
      this.loginError = '';
      try {
        const response = await fetch(`${this.$root.apiBase}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.loginForm)
        });
        const result = await response.json();
        if (result.ok) {
          localStorage.setItem('token', result.token);
          localStorage.setItem('loggedIn', 'true');
          await this.$root.fetchLessons();
          await this.$root.fetchCart();
          await this.$root.fetchOrders();
          this.$router.push('/lessons');
        } else {
          this.loginError = result.error || 'Login failed';
        }
      } catch (error) {
        console.error('Login error:', error);
        this.loginError = 'Network error. Please try again.';
      }
    }
  }
};

const LessonsComponent = {
  template: `
    <div>
      <div v-if="$root.cart.length > 0" class="alert alert-info">
        <strong>Cart:</strong> {{ $root.cart.length }} items
        <router-link to="/cart" class="btn btn-sm btn-primary ms-2">View Cart</router-link>
      </div>
      <div class="mb-3">
        <input type="text" v-model="searchTerm" @input="searchLessons" class="form-control" placeholder="Search lessons...">
      </div>
      <div class="mb-3">
        <button @click="sortBy('subject')" class="btn btn-outline-primary me-2">Sort by Subject {{ sortOrder.subject === 'asc' ? '↑' : '↓' }}</button>
        <button @click="sortBy('location')" class="btn btn-outline-primary me-2">Sort by Location {{ sortOrder.location === 'asc' ? '↑' : '↓' }}</button>
        <button @click="sortBy('price')" class="btn btn-outline-primary me-2">Sort by Price {{ sortOrder.price === 'asc' ? '↑' : '↓' }}</button>
        <button @click="sortBy('spaces')" class="btn btn-outline-primary">Sort by Spaces {{ sortOrder.spaces === 'asc' ? '↑' : '↓' }}</button>
      </div>
      <div class="row">
        <div v-for="lesson in lessons" :key="lesson._id" class="col-md-6 col-lg-4 mb-4">
          <div class="card h-100">
            <div class="card-body">
              <h5 class="card-title"><i :class="lesson.icon"></i> {{ lesson.subject }}</h5>
              <p class="card-text">Location: {{ lesson.location }}</p>
              <p class="card-text">Price: £{{ lesson.price }}</p>
              <p class="card-text">Spaces: {{ lesson.spaces }}</p>
              <button @click="$root.addToCart(lesson)" :disabled="lesson.spaces === 0" class="btn btn-primary">Add to Cart</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      lessons: [],
      searchTerm: '',
      sortOrder: {
        subject: 'asc',
        location: 'asc',
        price: 'asc',
        spaces: 'asc'
      }
    };
  },
  async mounted() {
    await this.fetchLessons();
  },
  methods: {
    async fetchLessons() {
      try {
        const response = await fetch(`${this.$root.apiBase}/lessons`);
        this.lessons = await response.json();
      } catch (error) {
        console.error('Failed to fetch lessons:', error);
      }
    },
    async searchLessons() {
      if (this.searchTerm.trim() === '') {
        await this.fetchLessons();
        return;
      }
      try {
        const response = await fetch(`${this.$root.apiBase}/search?q=${encodeURIComponent(this.searchTerm)}`);
        this.lessons = await response.json();
      } catch (error) {
        console.error('Search failed:', error);
      }
    },
    sortBy(attribute) {
      this.sortOrder[attribute] = this.sortOrder[attribute] === 'asc' ? 'desc' : 'asc';
      const order = this.sortOrder[attribute] === 'asc' ? 1 : -1;
      if (['subject', 'location'].includes(attribute)) {
        // Case-insensitive alphabetical sorting for strings
        this.lessons.sort((a, b) => {
          const aVal = a[attribute].toLowerCase();
          const bVal = b[attribute].toLowerCase();
          if (aVal < bVal) return -order;
          if (aVal > bVal) return order;
          return 0;
        });
      } else {
        this.lessons.sort((a, b) => {
          if (a[attribute] < b[attribute]) return -order;
          if (a[attribute] > b[attribute]) return order;
          return 0;
        });
      }
    }
  }
};

const CartComponent = {
  template: `
    <div>
      <h2>Shopping Cart</h2>
      <div v-if="cart.length === 0" class="alert alert-info">Your cart is empty.</div>
      <div v-else>
        <div v-for="(item, index) in cart" :key="index" class="card mb-3">
          <div class="card-body">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" v-model="selectedItems" :value="index" :id="'item-' + index">
              <label class="form-check-label" :for="'item-' + index">
                <h5>{{ item.subject }}</h5>
                <p>Quantity: {{ item.qty }}</p>
                <p>Price: £{{ item.price * item.qty }}</p>
              </label>
            </div>
            <button @click="removeFromCart(index)" class="btn btn-danger">Remove</button>
          </div>
        </div>
        <h4>Total: £{{ selectedTotalPrice }}</h4>
        <form @submit.prevent="checkout" class="mt-4">
          <div class="mb-3">
            <label for="name" class="form-label">Name</label>
            <input type="text" id="name" v-model="orderForm.name" class="form-control" required>
          </div>
          <div class="mb-3">
            <label for="phone" class="form-label">Phone (at least 10 digits)</label>
            <input type="text" id="phone" v-model="orderForm.phone" class="form-control" required>
          </div>
          <div class="mb-3">
            <label for="cardNumber" class="form-label">Card Number (16 digits)</label>
            <input type="text" id="cardNumber" v-model="orderForm.cardNumber" class="form-control" required>
          </div>
          <div class="mb-3">
            <label for="expiry" class="form-label">Expiry Date (MM/YY)</label>
            <input type="text" id="expiry" v-model="orderForm.expiry" class="form-control" placeholder="MM/YY" required>
          </div>
          <div class="mb-3">
            <label for="cvv" class="form-label">CVV (3 digits)</label>
            <input type="text" id="cvv" v-model="orderForm.cvv" class="form-control" required>
          </div>
          <div class="mb-3">
            <label for="cardholderName" class="form-label">Cardholder Name</label>
            <input type="text" id="cardholderName" v-model="orderForm.cardholderName" class="form-control" required>
          </div>
          <button type="submit" :disabled="!isFormValid || selectedItems.length === 0" class="btn btn-success">Checkout Selected Items</button>
          <div v-if="checkoutError" class="alert alert-danger mt-3">{{ checkoutError }}</div>
        </form>
      </div>
    </div>
  `,
  data() {
    return {
      selectedItems: [],
      orderForm: {
        name: '',
        phone: '',
        cardNumber: '',
        expiry: '',
        cvv: '',
        cardholderName: ''
      },
      checkoutError: ''
    };
  },
  computed: {
    cart() {
      return this.$root.cart;
    },
    selectedTotalPrice() {
      return this.selectedItems.reduce((total, index) => {
        const item = this.cart[index];
        return total + item.price * item.qty;
      }, 0);
    },
    isFormValid() {
      const nameRegex = /^[a-zA-Z\s]+$/;
      const phoneRegex = /^\d{10,}$/;
      const cardNumberRegex = /^\d{16}$/;
      const expiryRegex = /^(0[1-9]|1[0-2])\/\d{2}$/;
      const cvvRegex = /^\d{3}$/;
      const cardholderNameRegex = /^[a-zA-Z\s]+$/;
      return nameRegex.test(this.orderForm.name) &&
             phoneRegex.test(this.orderForm.phone) &&
             cardNumberRegex.test(this.orderForm.cardNumber) &&
             expiryRegex.test(this.orderForm.expiry) &&
             cvvRegex.test(this.orderForm.cvv) &&
             cardholderNameRegex.test(this.orderForm.cardholderName);
    }
  },
  methods: {
    async removeFromCart(index) {
      const item = this.cart[index];
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${this.$root.apiBase}/cart/remove`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ lessonId: item._id, qty: item.qty })
        });
        const result = await response.json();
        if (result.ok) {
          await this.$root.fetchCart();
          await this.$root.fetchLessons();
        } else {
          console.error('Failed to remove from cart:', result.error);
        }
      } catch (error) {
        console.error('Remove from cart error:', error);
      }
    },
    async checkout() {
      this.checkoutError = '';
      if (!this.isFormValid || this.selectedItems.length === 0) return;
      const selectedCartItems = this.selectedItems.map(index => this.cart[index]);
      const order = {
        name: this.orderForm.name,
        phone: this.orderForm.phone,
        items: selectedCartItems.map(item => ({ lessonId: item._id, qty: item.qty }))
      };
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${this.$root.apiBase}/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(order)
        });
        const result = await response.json();
        if (result.ok) {
          alert('Order placed successfully!');
          // Remove selected items from cart
          this.selectedItems.sort((a, b) => b - a); // Sort in descending order to remove from end
          this.selectedItems.forEach(index => {
            this.$root.cart.splice(index, 1);
          });
          this.selectedItems = [];
          this.orderForm = { name: '', phone: '', cardNumber: '', expiry: '', cvv: '', cardholderName: '' };
          this.$router.push('/lessons');
          await this.$root.fetchLessons();
          await this.$root.fetchOrders();
        } else {
          this.checkoutError = result.error || 'Order failed';
        }
      } catch (error) {
        console.error('Checkout failed:', error);
        this.checkoutError = 'Network error. Please try again.';
      }
    }
  }
};

const OrdersComponent = {
  template: `
    <div>
      <h2>My Orders</h2>
      <div v-if="orders.length === 0" class="alert alert-info">No orders found.</div>
      <div v-else>
        <div v-for="order in orders" :key="order._id" class="card mb-3">
          <div class="card-body">
            <h5>Order ID: {{ order._id }}</h5>
            <p>Name: {{ order.name }}</p>
            <p>Phone: {{ order.phone }}</p>
            <p>Total: £{{ order.total }}</p>
            <p>Date: {{ new Date(order.createdAt).toLocaleDateString() }}</p>
            <h6>Items:</h6>
            <ul>
              <li v-for="item in order.items" :key="item.lessonId">{{ item.qty }} x {{ getLessonName(item.lessonId) }}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      orders: []
    };
  },
  async mounted() {
    await this.fetchOrders();
  },
  methods: {
    async fetchOrders() {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${this.$root.apiBase}/orders`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        this.orders = await response.json();
      } catch (error) {
        console.error('Failed to fetch orders:', error);
      }
    },
    getLessonName(lessonId) {
      const lesson = this.$root.lessons.find(l => l._id === lessonId);
      return lesson ? lesson.subject : 'Unknown Lesson';
    }
  }
};

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: LoginComponent },
  { path: '/lessons', component: LessonsComponent },
  { path: '/cart', component: CartComponent },
  { path: '/orders', component: OrdersComponent }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

const App = {
  template: `
    <div>
      <nav v-if="isLoggedIn" class="navbar navbar-expand-lg navbar-light bg-light">
        <div class="container-fluid">
          <router-link to="/lessons" class="navbar-brand">After School App</router-link>
          <div class="navbar-nav">
            <router-link to="/lessons" class="nav-link">Lessons</router-link>
            <router-link to="/cart" class="nav-link"><i class="fas fa-shopping-cart"></i> <span v-if="cart.length > 0" class="badge bg-primary">{{ cart.length }}</span></router-link>
            <router-link to="/orders" class="nav-link">Orders</router-link>
            <button @click="logout" class="btn btn-outline-danger ms-2">Logout</button>
          </div>
        </div>
      </nav>
      <router-view></router-view>
    </div>
  `,
  data() {
    return {
      currentView: 'login',
      loginForm: {
        user: '',
        password: ''
      },
      loginError: '',
      lessons: [],
      cart: [],
      orders: [],
      searchTerm: '',
      sortOrder: {
        subject: 'asc',
        location: 'asc',
        price: 'asc',
        spaces: 'asc'
      },
      apiBase: localStorage.getItem('apiBase') || 'http://localhost:8080'
    };
  },
  computed: {
    isLoggedIn() {
      return localStorage.getItem('loggedIn') === 'true';
    }
  },
  async mounted() {
    // Check if already logged in
    const loggedIn = localStorage.getItem('loggedIn');
    if (loggedIn === 'true') {
      await this.fetchLessons();
      await this.fetchCart();
      await this.fetchOrders();
      this.$router.push('/lessons');
    } else {
      this.$router.push('/login');
    }
  },
  methods: {
    async login() {
      this.loginError = '';
      try {
        const response = await fetch(`${this.apiBase}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.loginForm)
        });
        const result = await response.json();
        if (result.ok) {
          localStorage.setItem('token', result.token);
          localStorage.setItem('loggedIn', 'true');
          this.currentView = 'lessons';
          await this.fetchLessons();
          await this.fetchCart();
          await this.fetchOrders();
          this.$router.push('/lessons');
        } else {
          if (result.error === 'Invalid credentials') {
            this.loginError = 'Student ID must be in the format e.g. M00123456';
          } else {
            this.loginError = result.error || 'Login failed';
          }
        }
      } catch (error) {
        console.error('Login error:', error);
        this.loginError = 'Network error. Please try again.';
      }
    },

    async fetchOrders() {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${this.apiBase}/orders`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        this.orders = await response.json();
      } catch (error) {
        console.error('Failed to fetch orders:', error);
      }
    },
    async fetchCart() {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${this.apiBase}/cart`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        this.cart = await response.json();
      } catch (error) {
        console.error('Failed to fetch cart:', error);
      }
    },
    async fetchLessons() {
      try {
        const response = await fetch(`${this.apiBase}/lessons`);
        this.lessons = await response.json();
      } catch (error) {
        console.error('Failed to fetch lessons:', error);
      }
    },
    async searchLessons() {
      if (this.searchTerm.trim() === '') {
        await this.fetchLessons();
        return;
      }
      try {
        const response = await fetch(`${this.apiBase}/search?q=${encodeURIComponent(this.searchTerm)}`);
        this.lessons = await response.json();
      } catch (error) {
        console.error('Search failed:', error);
      }
    },
    sortBy(attribute) {
      this.sortOrder[attribute] = this.sortOrder[attribute] === 'asc' ? 'desc' : 'asc';
      const order = this.sortOrder[attribute] === 'asc' ? 1 : -1;
      this.lessons.sort((a, b) => {
        if (a[attribute] < b[attribute]) return -order;
        if (a[attribute] > b[attribute]) return order;
        return 0;
      });
    },
    async addToCart(lesson) {
      if (lesson.spaces > 0) {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`${this.apiBase}/cart/add`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ lessonId: lesson._id, qty: 1 })
          });
          const result = await response.json();
          if (result.ok) {
            await this.fetchCart();
            await this.fetchLessons();
          } else {
            console.error('Failed to add to cart:', result.error);
          }
        } catch (error) {
          console.error('Add to cart error:', error);
        }
      }
    },

    async checkout() {
      this.checkoutError = '';
      if (!this.isFormValid) return;
      const order = {
        name: this.orderForm.name,
        phone: this.orderForm.phone,
        items: this.cart.map(item => ({ lessonId: item._id, qty: item.qty }))
      };
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${this.apiBase}/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(order)
        });
        const result = await response.json();
        if (result.ok) {
          alert('Order placed successfully!');
          this.cart = [];
          this.orderForm = { name: '', phone: '', cardNumber: '', expiry: '', cvv: '', cardholderName: '' };
          this.currentView = 'lessons';
          await this.fetchLessons();
          await this.fetchOrders();
          this.$router.push('/lessons');
        } else {
          this.checkoutError = result.error || 'Order failed';
        }
      } catch (error) {
        console.error('Checkout failed:', error);
        this.checkoutError = 'Network error. Please try again.';
      }
    },
    logout() {
      localStorage.removeItem('token');
      localStorage.removeItem('loggedIn');
      this.cart = [];
      this.orders = [];
      this.lessons = [];
      this.$router.push('/login');
    },
    getLessonName(lessonId) {
      const lesson = this.lessons.find(l => l._id === lessonId);
      return lesson ? lesson.subject : 'Unknown Lesson';
    }
  }
};

createApp(App).use(router).mount('#app');
