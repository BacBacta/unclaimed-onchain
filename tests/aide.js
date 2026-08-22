/* Aides partagées par les suites. */

/* Le total est animé depuis zéro par countUp sur ~900 ms, et le balayage live
   peut le reprendre en cours de route. Le lire d'un coup juste après la
   recherche attrape donc une valeur transitoire — « $0.00 » le plus souvent,
   ce qui faisait échouer des assertions au hasard sous charge parallèle.
   On lit quand deux relevés consécutifs concordent : indépendant de la durée
   de l'animation comme du moment où le direct arrive. */
async function totalStable(page, ms = 15000) {
  const lire = () => page.locator('#out .total .big').innerText().catch(() => '');
  const t0 = Date.now();
  let precedent = await lire();
  while (Date.now() - t0 < ms) {
    await page.waitForTimeout(120);
    const actuel = await lire();
    if (actuel === precedent && actuel !== '') return actuel;
    precedent = actuel;
  }
  console.log('  ⚠ total jamais stabilisé en ' + ms + ' ms (dernier : ' + precedent + ')');
  return precedent;
}

module.exports = { totalStable };
