import {
  Amphora,
  Apple,
  Baby,
  Banana,
  Bandage,
  Battery,
  Bean,
  Beer,
  BicepsFlexed,
  Brush,
  Bubbles,
  CakeSlice,
  Candy,
  Carrot,
  Cherry,
  Citrus,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Donut,
  Egg,
  Flame,
  Flower2,
  GlassWater,
  Grape,
  IceCreamCone,
  LeafyGreen,
  Lightbulb,
  Milk,
  Nut,
  Package,
  PawPrint,
  Pill,
  Pizza,
  Popcorn,
  Popsicle,
  Refrigerator,
  Salad,
  Sandwich,
  Scroll,
  ShoppingBasket,
  Snowflake,
  SoapDispenserDroplet,
  Soup,
  Sparkles,
  SprayCan,
  Toothbrush,
  Trash2,
  WashingMachine,
  Wheat,
  Wine,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { recognizeProduct, type Department, type ProductIcon as IconKey } from "@/lib/shopping/catalog";
import { departmentOf } from "@/lib/shopping/list";

const ICONS: Record<IconKey, LucideIcon> = {
  apple: Apple,
  banana: Banana,
  berries: Cherry,
  citrus: Citrus,
  grape: Grape,
  carrot: Carrot,
  leafy: LeafyGreen,
  salad: Salad,
  bean: Bean,
  nut: Nut,
  milk: Milk,
  egg: Egg,
  protein: BicepsFlexed,
  wheat: Wheat,
  croissant: Croissant,
  sandwich: Sandwich,
  pizza: Pizza,
  cake: CakeSlice,
  donut: Donut,
  cookie: Cookie,
  candy: Candy,
  popcorn: Popcorn,
  bottle: Amphora,
  can: Package,
  soup: Soup,
  coffee: Coffee,
  snowflake: Snowflake,
  icecream: IceCreamCone,
  popsicle: Popsicle,
  water: GlassWater,
  soda: CupSoda,
  wine: Wine,
  beer: Beer,
  spray: SprayCan,
  washing: WashingMachine,
  bubbles: Bubbles,
  paper: Scroll,
  trash: Trash2,
  bulb: Lightbulb,
  battery: Battery,
  flame: Flame,
  brush: Brush,
  flower: Flower2,
  paw: PawPrint,
  soap: SoapDispenserDroplet,
  toothbrush: Toothbrush,
  sparkles: Sparkles,
  bandage: Bandage,
  pill: Pill,
  baby: Baby,
};

/** Colore (token di globals.css) e icona di ripiego di ogni reparto. */
const DEPARTMENT_LOOK: Record<Department, { tone: string; icon: LucideIcon }> = {
  "Frutta e verdura": { tone: "var(--dept-produce)", icon: LeafyGreen },
  Frigo: { tone: "var(--dept-fridge)", icon: Refrigerator },
  "Pane e forno": { tone: "var(--dept-bakery)", icon: Croissant },
  Dispensa: { tone: "var(--dept-pantry)", icon: Package },
  Surgelati: { tone: "var(--dept-frozen)", icon: Snowflake },
  Bevande: { tone: "var(--dept-drinks)", icon: GlassWater },
  Casa: { tone: "var(--dept-home)", icon: SprayCan },
  "Cura della persona": { tone: "var(--dept-care)", icon: Sparkles },
};

const OTHER = { tone: "var(--dept-other)", icon: ShoppingBasket };

function look(department: string | null) {
  return (department && DEPARTMENT_LOOK[department as Department]) || OTHER;
}

/** Da mettere su un contenitore: i figli leggono il colore del reparto da `--dept`. */
export function departmentStyle(department: string | null): CSSProperties {
  return { "--dept": look(department).tone } as CSSProperties;
}

/** L'icona che evoca il prodotto; se il nome non dice nulla, quella del reparto. */
export function ProductIcon({ name, department, size = 22 }: { name: string; department: string | null; size?: number }) {
  const key = recognizeProduct(name)?.icon;
  const Glyph = key ? ICONS[key] : look(departmentOf(name, department)).icon;
  return <Glyph size={size} strokeWidth={1.6} aria-hidden="true" focusable="false" />;
}
