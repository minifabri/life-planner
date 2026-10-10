import { normalizeName } from "./entry";

/** Reparti proposti, nell'ordine in cui compaiono nella lista. Chi non ne ha finisce in "Altro". */
export const DEPARTMENTS = [
  "Frutta e verdura",
  "Frigo",
  "Pane e forno",
  "Dispensa",
  "Surgelati",
  "Bevande",
  "Casa",
  "Cura della persona",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export type ProductIcon =
  | "apple"
  | "banana"
  | "berries"
  | "citrus"
  | "grape"
  | "carrot"
  | "leafy"
  | "salad"
  | "bean"
  | "nut"
  | "milk"
  | "egg"
  | "vegan"
  | "meat"
  | "poultry"
  | "ham"
  | "burger"
  | "fish"
  | "shrimp"
  | "wheat"
  | "croissant"
  | "sandwich"
  | "pizza"
  | "cake"
  | "donut"
  | "cookie"
  | "candy"
  | "popcorn"
  | "bottle"
  | "can"
  | "soup"
  | "coffee"
  | "snowflake"
  | "icecream"
  | "popsicle"
  | "water"
  | "soda"
  | "wine"
  | "beer"
  | "spray"
  | "washing"
  | "bubbles"
  | "paper"
  | "trash"
  | "bulb"
  | "battery"
  | "flame"
  | "brush"
  | "flower"
  | "paw"
  | "soap"
  | "toothbrush"
  | "sparkles"
  | "bandage"
  | "pill"
  | "baby";

export type Recognized = { department: Department; icon: ProductIcon | null };

/**
 * Dizionario iniziale: reparto, icona, parole. Una parola con `*` vale come inizio
 * ("zucchin*" → zucchina, zucchine); più parole di seguito valgono come frase ("carta igienica").
 */
const CATALOG: [Department, ProductIcon | null, string][] = [
  // Frutta e verdura
  ["Frutta e verdura", "apple", "mela, mele, pera, pere, pesca, pesche, albicocc*, prugn*, susin*, kiwi, cachi, fico, fichi, mango, papaya, avocado, melagran*, melogran*, melone, meloni, anguria, ananas, frutta"],
  ["Frutta e verdura", "banana", "banan*"],
  ["Frutta e verdura", "berries", "ciliegi*, fragol*, lampon*, mirtill*, more, ribes, frutti di bosco, pomodor*"],
  ["Frutta e verdura", "citrus", "limon*, aranc*, mandarin*, clementin*, pompelm*, lime, cedro, bergamott*"],
  ["Frutta e verdura", "grape", "uva"],
  ["Frutta e verdura", "carrot", "carot*, patat*, cipoll*, cipollott*, aglio, scalogn*, zenzero, barbabietol*, rapa, rape, ravanell*, topinambur"],
  ["Frutta e verdura", "leafy", "lattug*, rucola, spinac*, bietol*, cavol*, verza, broccol*, cime di rapa, radicchio, valerian*, songino, cicoria, catalogna, indivia, scarola, sedano, finocchi*, basilico, prezzemolo, menta, salvia, rosmarino, erbe aromatiche, erba cipollina, coriandolo, porro, porri, kale, friariell*, agretti, asparag*"],
  ["Frutta e verdura", "salad", "insalat*, verdur*, zucchin*, zucca, zucche, melanzan*, peperon*, cetriol*, funghi, fungo, champignon, carciof*, germogli"],
  ["Frutta e verdura", "bean", "fagiolin*, pisell*, fave, taccole, edamame"],

  // Frigo
  ["Frigo", "milk", "latte, yogurt, yoghurt, kefir, skyr, panna, besciamella, burro, margarina, formagg*, mozzarell*, ricotta, parmigian*, grana, pecorino, stracchino, scamorza, feta, gorgonzola, mascarpone, philadelphia, burrata, provol*, fontina, emmental, robiola, crescenza, caprino, halloumi, fiocchi di latte, bevanda vegetale, bevanda di soia, bevanda di avena"],
  ["Frigo", "egg", "uova, uovo"],
  ["Frigo", "vegan", "tofu, tempeh, seitan, hummus, burger vegetal*, burger di soia"],
  ["Frigo", "meat", "carne, manzo, vitello, bistecc*, macinato, salsicc*, maiale, agnello, spezzatino, polpett*, fettine"],
  ["Frigo", "burger", "hamburger, burger"],
  ["Frigo", "poultry", "pollo, tacchino, cosce, fusi"],
  ["Frigo", "ham", "prosciutto, salame, salami, speck, bresaola, mortadella, pancetta, guanciale, wurstel, affettat*, salumi"],
  ["Frigo", "fish", "pesce, salmone, merluzzo, orata, branzino, spigola, sogliola, trota, baccala, platessa"],
  ["Frigo", "shrimp", "gamber*, scampi, cozze, vongole, calamari, polpo, seppi*, frutti di mare"],
  ["Frigo", "wheat", "ravioli, tortellini, tortelloni, gnocchi, pasta fresca, pasta sfoglia, pasta brisee, pasta frolla, pasta per pizza, lievito di birra"],

  // Pane e forno
  ["Pane e forno", "wheat", "pane, baguette, ciabatt*, focacci*, piadin*, grissin*, cracker, crackers, fette biscottate, gallette, taralli, freselle, friselle, tortillas, wrap, pita"],
  ["Pane e forno", "sandwich", "panino, panini, pancarre, pan bauletto, tramezzini"],
  ["Pane e forno", "croissant", "cornett*, brioche, brioches, croissant"],
  ["Pane e forno", "pizza", "pizza, pizze, pinsa"],
  ["Pane e forno", "cake", "torta, torte, crostata, muffin, plumcake, pan di spagna"],
  ["Pane e forno", "donut", "ciambell*, bombolon*"],

  // Dispensa
  ["Dispensa", "wheat", "pasta, spaghetti, penne, fusilli, rigatoni, linguine, tagliatelle, lasagne, farfalle, orecchiette, paccheri, maccheroni, riso, farro, orzo, quinoa, cous cous, couscous, bulgur, miglio, avena, fiocchi, farina, semola, polenta, cereali, muesli, granola, pangrattato, lievito, amido, fecola"],
  ["Dispensa", "bean", "legumi, lenticchi*, ceci, fagioli, cannellini, borlotti, soia, lupini"],
  ["Dispensa", "nut", "noce, noci, mandorl*, nocciol*, anacard*, pistacch*, arachid*, pinoli, frutta secca, semi, uvetta, datteri, burro di arachidi, tahina, tahin"],
  ["Dispensa", "bottle", "olio, aceto, salsa, salse, passata, polpa, pelati, pomodori pelati, sugo, sughi, pesto, ketchup, maionese, senape, concentrato, tamari, miele, marmellat*, confettur*, sciroppo d acero"],
  ["Dispensa", "can", "tonno, sgombro, mais, olive, capperi, sottaceti, sottoli, giardiniera, pomodori secchi, acciugh*, alici"],
  ["Dispensa", "soup", "zuppa, zuppe, minestrone, vellutata, brodo, dado"],
  ["Dispensa", null, "sale, pepe, peperoncino, spezie, curry, curcuma, paprika, cannella, origano, noce moscata, zafferano, cumino, vaniglia, lievito alimentare"],
  ["Dispensa", "cookie", "biscott*, wafer, merendin*"],
  ["Dispensa", "candy", "cioccolat*, caramell*, nutella, crema spalmabile, crema di nocciole, barrett*, zucchero, gomme, dolcetti"],
  ["Dispensa", "popcorn", "popcorn, patatine, snack, chips, salatini"],
  ["Dispensa", "coffee", "caffe, capsule, cialde, te, tisana, tisane, camomilla, infuso, orzo solubile, cacao, matcha"],
  ["Dispensa", "baby", "omogeneizzat*"],

  // Surgelati
  ["Surgelati", "snowflake", "surgelat*, congelat*, ghiaccio, sofficini"],
  ["Surgelati", "fish", "bastoncini"],
  ["Surgelati", "icecream", "gelato, gelati, sorbetto"],
  ["Surgelati", "popsicle", "ghiacciol*"],

  // Bevande
  ["Bevande", "water", "acqua"],
  ["Bevande", "soda", "succo, succhi, bibita, bibite, coca, cola, aranciata, limonata, gazzosa, chinotto, tonica, spremuta, kombucha, sciroppo, te freddo, the, estathe, energy drink"],
  ["Bevande", "wine", "vino, vini, prosecco, spumante, champagne, aperol, spritz, gin, vodka, rum, whisky, amaro, liquore, limoncello, campari, vermouth"],
  ["Bevande", "beer", "birra, birre"],

  // Casa
  ["Casa", "spray", "detersivo, detergente, sgrassatore, candeggina, anticalcare, brillantante, pulivetri, acqua distillata"],
  ["Casa", "washing", "lavatrice, ammorbidente, sapone bucato, sapone di marsiglia, smacchiatore"],
  ["Casa", "bubbles", "detersivo piatti, sapone piatti, lavastoviglie, spugn*, pagliett*"],
  ["Casa", "paper", "carta, carta igienica, scottex, rotoloni, tovagliol*, fazzolett*, alluminio, pellicola, stagnola"],
  ["Casa", "trash", "sacchetti, sacchi"],
  ["Casa", "bulb", "lampadin*"],
  ["Casa", "battery", "pile, batteria, batterie"],
  ["Casa", "flame", "candela, candele, accendino, fiammiferi, accendifuoco, incenso"],
  ["Casa", "brush", "scopa, mocio, panno, panni, stracci, guanti"],
  ["Casa", "flower", "fiori, pianta, piante, terriccio, concime"],
  ["Casa", "paw", "crocchette, croccantini, lettiera, gatto, gatti, cane, cani, cibo gatto, cibo cane"],

  // Cura della persona
  ["Cura della persona", "soap", "sapone, bagnoschiuma, docciaschiuma, gel doccia, shampoo, balsamo, igienizzante, detergente viso, detergente intimo, detergente mani, detergente corpo"],
  ["Cura della persona", "toothbrush", "dentifricio, spazzolin*, collutorio, filo interdentale, scovolin*"],
  ["Cura della persona", "sparkles", "crema, deodorante, profumo, mascara, trucco, struccante, tonico, siero, maschera, smalto, acetone, rossetto, fondotinta, burrocacao, lozione, solare, protezione solare, olio corpo, latte detergente, latte corpo, latte solare, acqua micellare"],
  ["Cura della persona", "bandage", "cerott*, garze, disinfettante, acqua ossigenata, cotone, cotton, dischetti, dischi, assorbenti, salvaslip, tamponi, coppetta, rasoio, rasoi, lamette, schiuma da barba, ceretta, strisce depilatorie"],
  ["Cura della persona", "pill", "tachipirina, aspirina, ibuprofene, oki, moment, integrator*, vitamin*, farmac*, medicin*, magnesio, melatonina, fermenti, probiotici, omega, sciroppo tosse"],
  ["Cura della persona", "baby", "pannolin*, salviett*"],
];

type Pattern = Recognized & { tokens: { text: string; prefix: boolean }[]; length: number };

const PATTERNS: Pattern[] = CATALOG.flatMap(([department, icon, words]) =>
  words.split(",").map((keyword) => {
    const tokens = words_(keyword).map((word) => ({ text: word.replace("*", ""), prefix: word.endsWith("*") }));
    return { department, icon, tokens, length: tokens.reduce((n, t) => n + t.text.length, 0) };
  }),
);

/** Chi lo dice nel nome va tra i surgelati, qualunque prodotto sia ("spinaci surgelati"). */
const FROZEN = /^(surgelat|congelat)/;

function words_(name: string): string[] {
  return normalizeName(name)
    .split(/[\s']+/)
    .filter(Boolean);
}

function matchesAt(pattern: Pattern, words: string[], at: number): boolean {
  if (at + pattern.tokens.length > words.length) return false;
  return pattern.tokens.every((token, i) => (token.prefix ? words[at + i].startsWith(token.text) : words[at + i] === token.text));
}

const cache = new Map<string, Recognized | null>();

/**
 * Riconosce reparto e icona dal nome. Conta la prima parola riconosciuta (in italiano il prodotto
 * viene prima: "cioccolato al latte" è cioccolato); a pari posizione vince la frase più lunga
 * ("latte detergente" batte "latte").
 */
export function recognizeProduct(name: string): Recognized | null {
  const key = normalizeName(name);
  const known = cache.get(key);
  if (known !== undefined) return known;

  const words = words_(key);
  let best: Pattern | null = null;
  for (let at = 0; at < words.length && !best; at++) {
    for (const pattern of PATTERNS) {
      if (!matchesAt(pattern, words, at)) continue;
      if (!best || pattern.tokens.length > best.tokens.length || (pattern.tokens.length === best.tokens.length && pattern.length > best.length)) {
        best = pattern;
      }
    }
  }
  const result: Recognized | null = best
    ? { department: words.some((w) => FROZEN.test(w)) ? "Surgelati" : best.department, icon: best.icon }
    : null;
  cache.set(key, result);
  return result;
}
