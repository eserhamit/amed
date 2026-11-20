"use strict";
// Contenu de départ (à remplacer depuis l'espace gérant). Ne remplace jamais des données existantes.
const db = require("../src/db");

async function seed() {
  await db.migrate.latest();
  if (Number((await db("pubs").count({ n: "*" }).first()).n) > 0) { if (require.main === module) console.log("Contenu déjà présent : rien à faire."); return; }
  const H = ["11:30 – 00:00", "11:30 – 00:00", "11:30 – 00:00", "11:30 – 00:00", "11:30 – 02:00", "11:30 – 02:00", "11:30 – 00:00"];
  await db("pubs").insert([
    { id: "chatelaine", name: "Châtelaine", area: "Av. de l'Étang 67 · 1er étage", status: "open", addr: "Avenue de l'Étang 67, 1er étage\n1219 Châtelaine (Vernier)", tel: "+41 22 796 05 13", services: "Terrasse · à l'emporter · paiement par carte", services_en: "Terrace · takeaway · card payment", maps_url: "https://www.google.com/maps/search/?api=1&query=Pub+Goudale+Gen%C3%A8ve+Avenue+de+l%27Etang+67+Ch%C3%A2telaine", hours: JSON.stringify(H), sort: 1 },
    { id: "tourelle", name: "Tourelle", area: "Ch. de la Tourelle 2", status: "open", addr: "Chemin de la Tourelle 2\n1209 Genève", tel: "+41 22 920 80 84", maps_url: "https://www.google.com/maps/search/?api=1&query=Pub+Goudale+Chemin+de+la+Tourelle+2+1209+Gen%C3%A8ve", hours: JSON.stringify(["11:30 – 00:00", "11:30 – 00:00", "11:30 – 00:00", "11:30 – 00:00", "11:30 – 02:00", "11:00 – 02:00", "11:00 – 00:00"]), sort: 2 },
    { id: "concorde", name: "Concorde", area: "Quartier de la Concorde", status: "soon", addr: "", hours: JSON.stringify(["", "", "", "", "", "", ""]), sort: 3 }
  ]);
  const items = [
    ["beer", "La Goudale Blonde", "", "Bière de garde, 7,2 % vol. · 25 / 50 cl", "Bière de garde, 7.2% ABV · 25 / 50 cl", "5.– · 9.–", "Phare", "Signature"],
    ["beer", "La Goudale Ambrée", "La Goudale Amber", "Notes caramel, 7,2 % vol. · 25 / 50 cl", "Caramel notes, 7.2% ABV · 25 / 50 cl", "5.– · 9.–", "", ""],
    ["beer", "La Goudale IPA", "", "Houblonnée et fraîche · 25 / 50 cl", "Hoppy and fresh · 25 / 50 cl", "5.50 · 10.–", "", ""],
    ["beer", "Bière du moment", "Seasonal beer", "Selon arrivage et saison", "Depending on the season", "dès 5.–", "", ""],
    ["beer", "Goudale 0,0", "Goudale 0.0", "Sans alcool, en bouteille", "Alcohol-free, bottled", "5.–", "", ""],
    ["food", "Burger Goudale", "", "Bœuf, cheddar affiné, oignons à la bière, frites maison", "Beef, aged cheddar, beer onions, homemade fries", "24.–", "Signature", "Signature"],
    ["food", "Burger du chef", "Chef's burger", "Recette qui change chaque mois", "A new recipe every month", "26.–", "", ""],
    ["food", "Planche du match", "Match platter", "Charcuterie, fromages, pickles, pour 2 à 3", "Cured meats, cheeses, pickles, for 2 to 3", "32.–", "", ""],
    ["food", "Salade, wings, nachos", "Salad, wings, nachos", "Options végétariennes disponibles", "Vegetarian options available", "dès 14.–", "", ""]
  ];
  await db("menu_items").insert(items.map((x, i) => ({ kind: x[0], name: x[1], name_en: x[2], descr: x[3], descr_en: x[4], price: x[5], tag: x[6], tag_en: x[7], sold_out: false, sort: i })));
  await db("week_menu").insert([
    { day: 0, name: "Émincé de volaille", name_en: "Sliced chicken", descr: "Sauce aux champignons, riz pilaf", descr_en: "Mushroom sauce, pilaf rice", price: "19.50" },
    { day: 1, name: "Carbonade flamande", name_en: "Flemish beef stew", descr: "Bœuf mijoté à la Goudale ambrée, frites", descr_en: "Beef slow-cooked in Goudale amber, fries", price: "21.–" },
    { day: 2, name: "Burger végétarien", name_en: "Veggie burger", descr: "Galette de légumes, salade", descr_en: "Vegetable patty, salad", price: "19.50" },
    { day: 3, name: "Fish & chips", name_en: "", descr: "Cabillaud en pâte à bière, sauce tartare", descr_en: "Beer-battered cod, tartare sauce", price: "21.–" },
    { day: 4, name: "Tartare de bœuf", name_en: "Beef tartare", descr: "Coupé au couteau, frites maison", descr_en: "Hand-cut, homemade fries", price: "24.–" }
  ]);
  await db("formules").insert([
    { label: "Apéro dînatoire", label_en: "Apéro buffet", descr: "Planches, finger food, 2 boissons par personne", descr_en: "Platters, finger food, 2 drinks per person", price_pp: 28, sort: 1 },
    { label: "Buffet pub", label_en: "Pub buffet", descr: "Burgers, salades, desserts, 1 boisson", descr_en: "Burgers, salads, desserts, 1 drink", price_pp: 45, sort: 2 },
    { label: "Bar ouvert", label_en: "Open bar", descr: "Buffet pub + boissons à volonté pendant 3 h", descr_en: "Pub buffet + unlimited drinks for 3 hours", price_pp: 65, sort: 3 }
  ]);
  await db("matches").insert([
    { day: 1, title: "Ligue des champions", sub: "Soirée européenne", time: "21:00", sort: 1 },
    { day: 5, title: "Super League", sub: "Servette FC", time: "18:00", sort: 2 },
    { day: 6, title: "Formule 1", sub: "Grand Prix", time: "14:00", sort: 3 }
  ]);
  await db("settings").insert([
    { key: "company_name", value: "Blackstore Sàrl" }, { key: "company_address", value: "" }, { key: "company_ide", value: "" },
    { key: "contact_email", value: "" }, { key: "annonce_active", value: "0" }, { key: "annonce_fr", value: "" }, { key: "annonce_en", value: "" },
    { key: "monday_auto", value: "0" }, { key: "reminders", value: "1" }
  ]);
  console.log("Contenu de départ installé (exemples à remplacer depuis l'espace gérant).");
}

if (require.main === module) seed().then(() => db.destroy()).catch(e => { console.error(e); process.exit(1); });
module.exports = seed;
