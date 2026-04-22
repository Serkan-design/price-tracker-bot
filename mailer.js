const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASS;
  if (!user || !pass) return null;

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return transporter;
}

async function sendAlert(to, subject, html) {
  const t = getTransporter();
  if (!t) {
    console.warn("Mailer yapılandırılmamış (GMAIL_USER/GMAIL_APP_PASS eksik)");
    return false;
  }
  try {
    await t.sendMail({
      from: `"Fiyat Bot" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`📧 Mail gönderildi → ${to}`);
    return true;
  } catch (err) {
    console.error("❌ Mail gönderilemedi:", err.message);
    return false;
  }
}

function buildXauAlertHtml({ type, price, change, rsi, signal, confidence, message }) {
  const color = signal === "BUY" ? "#22c55e" : signal === "SELL" ? "#ef4444" : "#f59e0b";
  const emoji = signal === "BUY" ? "📈" : signal === "SELL" ? "📉" : "⚖️";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
    <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:24px 32px;">
      <div style="font-size:28px;font-weight:900;color:#1c1917;">🥇 XAUUSD Sinyal</div>
      <div style="font-size:14px;color:#78350f;margin-top:4px;">${new Date().toLocaleString("tr-TR")}</div>
    </div>
    <div style="padding:32px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:48px;font-weight:900;color:#f8fafc;">$${Number(price).toFixed(2)}</div>
        <div style="font-size:16px;color:#94a3b8;margin-top:4px;">Spot Fiyat (XAU/USD)</div>
      </div>
      <div style="background:#0f172a;border-radius:12px;padding:20px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="color:#94a3b8;font-size:13px;">SİNYAL</span>
          <span style="background:${color}22;color:${color};padding:6px 16px;border-radius:20px;font-weight:700;font-size:15px;">${emoji} ${signal}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="color:#94a3b8;font-size:13px;">GÜVEN SKORU</span>
          <span style="color:#f8fafc;font-weight:700;">${confidence ?? "--"}%</span>
        </div>
        ${rsi !== null && rsi !== undefined ? `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="color:#94a3b8;font-size:13px;">RSI (14)</span>
          <span style="color:#f8fafc;font-weight:700;">${rsi}</span>
        </div>` : ""}
        ${change !== undefined ? `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#94a3b8;font-size:13px;">DEĞİŞİM</span>
          <span style="color:${change >= 0 ? "#22c55e" : "#ef4444"};font-weight:700;">${change >= 0 ? "+" : ""}$${Number(change).toFixed(2)}</span>
        </div>` : ""}
      </div>
      <div style="background:#0f172a;border-radius:12px;padding:16px;border-left:3px solid ${color};">
        <div style="color:#94a3b8;font-size:13px;margin-bottom:6px;">MESAJ</div>
        <div style="color:#f8fafc;font-size:14px;">${message}</div>
      </div>
      <div style="margin-top:24px;font-size:11px;color:#475569;text-align:center;">
        Bu araç teknik analiz göstergeleri sunar. Kesin al/sat sinyali değildir. Yatırım kararlarını kendi araştırmanla destekle.
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildProductAlertHtml({ name, url, oldPrice, newPrice, dropPct }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
    <div style="background:linear-gradient(135deg,#6366f1,#a855f7);padding:24px 32px;">
      <div style="font-size:24px;font-weight:900;color:#fff;">🎉 Fiyat Düştü!</div>
      <div style="font-size:14px;color:#c4b5fd;margin-top:4px;">${new Date().toLocaleString("tr-TR")}</div>
    </div>
    <div style="padding:32px;">
      <div style="font-size:18px;font-weight:700;color:#f8fafc;margin-bottom:20px;">${name}</div>
      <div style="display:flex;gap:16px;margin-bottom:20px;">
        <div style="flex:1;background:#0f172a;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">ESKİ FİYAT</div>
          <div style="font-size:22px;font-weight:700;color:#94a3b8;text-decoration:line-through;">${oldPrice} TL</div>
        </div>
        <div style="flex:1;background:#0f172a;border-radius:12px;padding:16px;text-align:center;border:1px solid #22c55e33;">
          <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">YENİ FİYAT</div>
          <div style="font-size:22px;font-weight:700;color:#22c55e;">${newPrice} TL</div>
        </div>
      </div>
      <div style="text-align:center;margin-bottom:24px;">
        <span style="background:#22c55e22;color:#22c55e;padding:8px 20px;border-radius:20px;font-weight:700;">%${Math.round(dropPct)} indirim!</span>
      </div>
      <a href="${url}" style="display:block;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;text-align:center;padding:14px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">Ürüne Git →</a>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { sendAlert, buildXauAlertHtml, buildProductAlertHtml };
