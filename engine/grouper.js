/**
 * engine/grouper.js
 * Farklı sitelerdeki aynı ürünleri normalize edip gruplar
 */

/**
 * Ürün başlığını temizle (karşılaştırma için)
 */
function normalizeTitle(title) {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") // Özel karakterleri sil
    .substring(0, 30); // İlk 30 karaktere odaklan
}

/**
 * Ürünleri grupla ve her gruptaki en ucuzu bul
 */
function groupProducts(products) {
  const groups = {};

  products.forEach((p) => {
    if (!p.active || !p.inStock) return;
    
    const key = normalizeTitle(p.name);
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });

  return groups;
}

/**
 * Bir gruptaki en ucuz ürünü bul
 */
function findCheapestInGroup(group) {
  if (!group || group.length === 0) return null;
  return group.reduce((prev, curr) => 
    (prev.currentPrice < curr.currentPrice) ? prev : curr
  );
}

module.exports = { groupProducts, findCheapestInGroup, normalizeTitle };
