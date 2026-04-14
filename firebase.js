const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// Service Account Key path
const serviceAccountPath = path.resolve(__dirname, "serviceAccountKey.json");

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("âœ… Firebase Admin SDK initialized!");
} else {
  console.warn("âš ï¸  serviceAccountKey.json NOT FOUND. Firebase features will be disabled.");
  console.warn("ðŸ“  Please place your Firebase Service Account JSON file in the project root.");
}

const db = admin.apps.length ? admin.firestore() : null;
const fcm = admin.apps.length ? admin.messaging() : null;

module.exports = { admin, db, fcm };
