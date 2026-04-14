require("dotenv").config();

async function testGemini(model, version) {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log(`Testing model: ${model} with version: ${version}`);
    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: "Sadece 'ok' yaz" }] }]
                })
            }
        );
        const data = await res.json();
        if (res.ok) {
            console.log(`✅ Success with ${version}/${model}:`, data?.candidates?.[0]?.content?.parts?.[0]?.text);
        } else {
            console.error(`❌ Error with ${version}/${model}:`, res.status, JSON.stringify(data.error));
        }
    } catch (err) {
        console.error(`❌ Fetch error with ${version}/${model}:`, err.message);
    }
}

async function run() {
    await testGemini("gemini-1.5-flash", "v1");
    await testGemini("gemini-1.5-flash", "v1beta");
    await testGemini("gemini-1.5-pro", "v1");
    await testGemini("gemini-1.5-pro", "v1beta");
}

run();
