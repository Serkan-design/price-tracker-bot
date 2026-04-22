const { db } = require("./firebase");
const bcrypt = require("bcryptjs");

const USERS_COLLECTION = "users";
const PRODUCTS_COLLECTION = "products";

const DB = {
  // --- USER METHODS ---
  async registerUser(email, password, name) {
    if (!db) return null;
    const hashedPassword = await bcrypt.hash(password, 10);
    const userRef = db.collection(USERS_COLLECTION).doc(email);
    const doc = await userRef.get();
    if (doc.exists) throw new Error("KullanÄ±cÄ± zaten mevcut");
    
    await userRef.set({
      email,
      password: hashedPassword,
      name,
      createdAt: new Date().toISOString(),
      notificationPref: { telegram: true, web: false },
      telegramChatId: null
    });
    return { email, name };
  },

  async loginUser(email, password) {
    if (!db) {
      console.error("[DB ERROR] Firebase not initialized");
      return null;
    }
    try {
      const userRef = db.collection(USERS_COLLECTION).doc(email);
      const doc = await userRef.get();
      if (!doc.exists) {
        console.warn(`[LOGIN] User not found: ${email}`);
        return null;
      }
      
      const user = doc.data();
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        console.warn(`[LOGIN] Password mismatch for: ${email}`);
        return null;
      }
      console.log(`[LOGIN] Success: ${email}`);
      return { email: user.email, name: user.name, telegramChatId: user.telegramChatId };
    } catch (err) {
      console.error(`[LOGIN ERROR] Exception for ${email}:`, err.message);
      throw err;
    }
  },

  async updateUserInfo(email, updates) {
    if (!db) return null;
    await db.collection(USERS_COLLECTION).doc(email).update(updates);
  },

  // --- PRODUCT METHODS ---
  async addProduct(product) {
    if (!db) return product; // Fallback if no firebase
    const docRef = await db.collection(PRODUCTS_COLLECTION).add({
      ...product,
      updatedAt: new Date().toISOString()
    });
    return { id: docRef.id, ...product };
  },

  async getProducts(userEmail) {
    if (!db) return [];
    const snapshot = await db.collection(PRODUCTS_COLLECTION).where("userId", "==", userEmail).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getAllActiveProducts() {
    if (!db) return [];
    const snapshot = await db.collection(PRODUCTS_COLLECTION).where("active", "==", true).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async updateProduct(productId, updates) {
    if (!db) return null;
    await db.collection(PRODUCTS_COLLECTION).doc(productId).update({
      ...updates,
      updatedAt: new Date().toISOString()
    });
  },

  async deleteProduct(productId) {
    if (!db) return null;
    await db.collection(PRODUCTS_COLLECTION).doc(productId).delete();
    return true;
  },

  async addPriceHistory(productId, price) {
    if (!db) return null;
    const productRef = db.collection(PRODUCTS_COLLECTION).doc(productId);
    const doc = await productRef.get();
    if (!doc.exists) return null;
    
    const history = doc.data().history || [];
    history.push({ price, date: new Date().toISOString() });
    
    // Keep last 30 days logic can be added here
    await productRef.update({ history });
  },
  db
};

module.exports = DB;