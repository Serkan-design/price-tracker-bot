const db = require("../db");
const bcrypt = require("bcryptjs");

async function testLogin() {
    try {
        const adminEmail = process.env.ADMIN_EMAIL || "test@test.com";
        const adminPass = process.env.ADMIN_PASSWORD || "password";
        console.log(`Testing login for: ${adminEmail}`);
        const user = await db.loginUser(adminEmail, adminPass);
        console.log("Login result:", user);
    } catch (err) {
        console.error("Login failed with error:", err);
    }
}

testLogin();
