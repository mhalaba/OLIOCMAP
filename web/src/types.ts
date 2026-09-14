export type Role = "citizen" | "zaufany" | "operator" | "admin";
export type Category =
  | "odpornosc"
  | "schron"
  | "aed"
  | "woda"
  | "prad"
  | "lacznosc"
  | "przemysl"
  | "potrzeba";
export type Status = "pending" | "verified" | "rejected" | "expired";
export type PublicGeom = "precise" | "gmina" | "hidden";
export type HostType = "osp" | "gmina" | "szkola" | "parafia" | "firma" | "prywatny" | "inny";
export type Activation = "stale" | "po_alarmie" | "po_godzinach_bez_pradu";
export type Service =
  | "ladowanie"
  | "ogrzewanie"
  | "woda"
  | "internet"
  | "posilek"
  | "nocleg"
  | "pierwsza_pomoc"
  | "toaleta"
  | "informacja"
  | "zwierzeta";
export type LinkType =
  | "starlink"
  | "wifi_publiczne"
  | "pmr446"
  | "cb"
  | "meshtastic"
  | "radioamator"
  | "telefon_satelitarny";
export type Capability =
  | "warsztat"
  | "spawanie"
  | "zywnosc"
  | "woda"
  | "paliwo_detal"
  | "leki_wydawanie"
  | "transport"
  | "magazyn"
  | "agregat"
  | "sprzet_ciezki"
  | "nocleg";
export type NeedType = "woda" | "zywnosc" | "leki" | "prad" | "ewakuacja" | "opieka" | "inne";
export type Urgency = "niska" | "srednia" | "wysoka";

export interface Point {
  id: string;
  category: Category;
  title: string;
  description?: string;
  lat?: number;
  lon?: number;
  public_lat?: number;
  public_lon?: number;
  public_geom?: PublicGeom;
  gmina_teryt?: string;
  gmina_name?: string;
  address?: string;
  status: Status;
  blocked?: boolean;
  host_type?: HostType;
  services?: Service[];
  link_type?: LinkType[];
  capability?: Capability[];
  capacity?: number;
  activation?: Activation;
  activation_hours?: number;
  autonomy_h?: number;
  hours?: string;
  opening_hours?: string;
  contact_public?: string;
  contact_operator?: string;
  consent?: boolean;
  civilians_ok?: boolean;
  created_by?: string;
  reporter_role?: Role;
  verified_by_node?: string;
  verified_by_name?: string;
  confirmed_by_name?: string;
  verified_at?: string;
  last_confirmed_at?: string;
  confirm_interval_days?: number;
  expires_at?: string;
  ttl_purged?: boolean;
  external_ref?: string;
  need_type?: NeedType;
  people?: number;
  urgency?: Urgency;
  assigned_to?: string;
  resolved_at?: string;
  source_node?: string;
  created?: string;
  expand?: { created_by?: { role?: string; name?: string } };
  conflict?: boolean;
  deleted_at?: string;
  hlc?: string;
  updated_at?: string;
}

export interface NodeStatus {
  node_id: string;
  node_name: string;
  role: string;
  gmina: string;
  gmina_teryt?: string;
  operator_name?: string;
  registration_mode?: string;
  mode: "wyspa" | "sync";
  last_pull: string;
  last_push: string;
  last_error?: string;
  peers: { node_id: string; ok: boolean; last_seen?: string; trusted?: boolean }[];
  counts: { by_category: Record<string, number>; by_status: Record<string, number> };
  potrzeba_open: number;
  version: string;
  tls_mode?: string;
  public_key?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  org_name?: string;
}

export const CATEGORY_COLORS: Record<Category, string> = {
  odpornosc: "#d7263d",
  schron: "#3a506b",
  aed: "#ff7f11",
  woda: "#1b98e0",
  prad: "#f4d35e",
  lacznosc: "#7b2cbf",
  przemysl: "#2a9d8f",
  potrzeba: "#6c757d",
};

/** Ścieżki SVG znaczników: web/src/icons.ts (`CATEGORY_ICONS`). */

export const DEFAULT_CATEGORY_ON: Record<Category, boolean> = {
  odpornosc: true,
  schron: true,
  aed: true,
  woda: true,
  prad: false,
  lacznosc: false,
  przemysl: true,
  potrzeba: false,
};

export const ALL_CATEGORIES: Category[] = [
  "odpornosc",
  "schron",
  "aed",
  "woda",
  "prad",
  "lacznosc",
  "przemysl",
  "potrzeba",
];

export const PUBLIC_CATEGORIES: Category[] = ALL_CATEGORIES.filter((c) => c !== "potrzeba");

export const SERVICE_FILTERS: Service[] = ["ladowanie", "ogrzewanie", "woda", "internet", "nocleg"];

export const SERVICE_OPTIONS: Service[] = [
  "ladowanie",
  "ogrzewanie",
  "woda",
  "internet",
  "posilek",
  "nocleg",
  "pierwsza_pomoc",
  "toaleta",
  "informacja",
  "zwierzeta",
];

export const CAPABILITY_OPTIONS: Capability[] = [
  "warsztat",
  "spawanie",
  "zywnosc",
  "woda",
  "paliwo_detal",
  "leki_wydawanie",
  "transport",
  "magazyn",
  "agregat",
  "sprzet_ciezki",
  "nocleg",
];

export const LINK_TYPE_OPTIONS: LinkType[] = [
  "starlink",
  "wifi_publiczne",
  "pmr446",
  "cb",
  "meshtastic",
  "radioamator",
  "telefon_satelitarny",
];
