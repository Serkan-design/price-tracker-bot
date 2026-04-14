const db = require("../db");
const bcrypt = require("bcryptjs");

async function testLogin() {
    try {
        console.log("Testing login for: serkanisik67@gmail.com");
        const user = await db.loginUser("serkanisik67@gmail.com", "admin123");
        console.log("Login result:", user);
    } catch (err) {
        console.error("Login failed with error:", err);
    }
}

testLogin();
