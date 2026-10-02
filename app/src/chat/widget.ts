// The hub_widget catalog — one parser, hand-written, zero new dependencies.
//
// Two rules shape this file.
//
// 1. A widget payload is written by the agent at run time. It is untrusted in
//    the same way a tool result is: a malformed `props` must render as a
//    readable "this widget was malformed" line, never crash the transcript.
//    Every parser below therefore returns `null` on bad input and the caller
//    falls back; nothing throws.
// 2. Colours are token NAMES, never free strings. `scripts/check-no-raw-color`
//    is a static grep over this repo's own source — it cannot see a hex string
//    an agent emits at run time (v2-decision-rich-components §4). The
//    `asColor` gate below is the only thing standing between Xavier and an
//    unthemed hex literal, so it validates against the real token key set.
import { dark, type TokenName } from '../theme/tokens.gen';
import { normaliseCondition, type Condition } from './weatherLayout';
import { metricOf, type MetricId } from './weatherMetrics';

const TOKEN_NAMES = new Set(Object.keys(dark));

export type WidgetKind =
  // `clarify` is the odd one out and deliberately so: it is NOT a hub_widget
  // kind. Asking the user to pick from a list is the native `clarify` tool's job
  // and only its job (v2-decision-rich-components §1) — the plugin delivers it
  // on the same `widget` part shape, so it is parsed here, but the gateway-side
  // catalog must never offer it. `test_widget_tool.py` asserts that split.
  | 'clarify'
  | 'card'
  | 'metric'
  | 'chart'
  | 'table'
  | 'progress'
  | 'link'
  | 'button_row'
  | 'poll'
  | 'checklist'
  | 'calendar'
  | 'weather'
  | 'form';

// --- primitives -------------------------------------------------------------

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  // The gateway hands numbers through JSON, but a model writing "42" into a
  // string field is common enough that rejecting it would be pedantry.
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function bool(v: unknown): boolean {
  return v === true || v === 'true';
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** A token name or nothing. See rule 2 at the top of this file. */
export function asColor(v: unknown): TokenName | null {
  const s = str(v);
  return s && TOKEN_NAMES.has(s) ? (s as TokenName) : null;
}

export type Tone = 'neutral' | 'up' | 'down' | 'warn' | 'accent';
const TONES: Tone[] = ['neutral', 'up', 'down', 'warn', 'accent'];

export function asTone(v: unknown): Tone {
  const s = str(v)?.toLowerCase();
  if (!s) return 'neutral';
  if (TONES.includes(s as Tone)) return s as Tone;
  // The words a model reaches for that mean the same thing.
  if (s === 'good' || s === 'ok' || s === 'success' || s === 'positive') return 'up';
  if (s === 'bad' || s === 'error' || s === 'danger' || s === 'negative') return 'down';
  if (s === 'warning' || s === 'caution' || s === 'pending') return 'warn';
  return 'neutral';
}

/** Links are rendered as taps. Only https survives — a `file://` or `javascript:`
 *  URL from an agent has no legitimate use here (VERDICT-V2 §7 trap). */
export function asHttpsUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return /^https:\/\/[^\s]+$/i.test(s) ? s : null;
}

// --- catalog shapes ---------------------------------------------------------

export interface CardRow {
  label: string;
  value: string;
  tone: Tone;
}
export interface CardWidget {
  kind: 'card';
  title: string | null;
  subtitle: string | null;
  body: string | null;
  rows: CardRow[];
  tone: Tone;
}

export interface MetricWidget {
  kind: 'metric';
  label: string;
  value: string;
  unit: string | null;
  delta: string | null;
  deltaTone: Tone;
  caption: string | null;
}

export interface ChartSeries {
  id: string;
  label: string;
  color: TokenName;
}
export interface ChartBucket {
  key: string;
  values: Record<string, number>;
}
export interface ChartWidget {
  kind: 'chart';
  variant: 'bars' | 'line';
  title: string | null;
  caption: string | null;
  series: ChartSeries[];
  buckets: ChartBucket[];
  /** Formats a bucket value for the axis/readout. `null` ⇒ plain number. */
  unit: string | null;
}

export interface TableColumn {
  key: string;
  label: string;
  align: 'left' | 'right';
}
export interface TableWidget {
  kind: 'table';
  title: string | null;
  caption: string | null;
  columns: TableColumn[];
  rows: Record<string, string>[];
}

export interface ProgressWidget {
  kind: 'progress';
  label: string | null;
  value: number;
  total: number;
  caption: string | null;
  tone: Tone;
}

export interface LinkWidget {
  kind: 'link';
  url: string;
  title: string;
  subtitle: string | null;
}

export interface ClarifyWidget {
  kind: 'clarify';
  /** The gateway's clarify id — the handle the answer resolves against. */
  clarifyId: string;
  question: string;
  choices: string[];
  multiSelect: boolean;
}

export interface WidgetButton {
  id: string;
  label: string;
  tone: Tone;
}
export interface ButtonRowWidget {
  kind: 'button_row';
  prompt: string | null;
  buttons: WidgetButton[];
}

export interface PollOption {
  id: string;
  label: string;
  votes: number;
}
export interface PollWidget {
  kind: 'poll';
  question: string;
  options: PollOption[];
  /** The option this device already chose, when the server echoed one back. */
  selectedId: string | null;
  closed: boolean;
}

export type ChecklistState = 'todo' | 'doing' | 'done' | 'blocked';
export interface ChecklistItem {
  id: string;
  label: string;
  state: ChecklistState;
  note: string | null;
}
export interface ChecklistWidget {
  kind: 'checklist';
  title: string | null;
  items: ChecklistItem[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  /** Minutes from midnight, 0..1440. All-day events carry null. */
  startMin: number | null;
  endMin: number | null;
  location: string | null;
  tone: Tone;
}
export interface CalendarDay {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  label: string | null;
  events: CalendarEvent[];
}
export interface CalendarWidget {
  kind: 'calendar';
  view: 'week' | 'day' | 'month';
  title: string | null;
  days: CalendarDay[];
}

export interface WeatherHour {
  label: string;
  temp: number;
  condition: Condition;
  /** Chance of rain, 0-100. */
  precip: number;
  night: boolean;
  /** The rest of what a forecast carries, when it carries it. Each is null
   * rather than 0 when absent: a missing wind reading is not a calm hour. */
  feels_like: number | null;
  wind: number | null;
  humidity: number | null;
  uv: number | null;
  cloud: number | null;
}

export interface WeatherDay {
  label: string;
  /** Both or neither: a precipitation-only day has no range to draw. */
  low: number | null;
  high: number | null;
  condition: Condition;
  /** Chance of rain, 0-100. */
  precip: number;
  /** Inches expected, when the forecast carries an amount. */
  precip_in: number | null;
  /** Hour-by-hour chance across the day, for the precipitation view's
   * sparkline — Apple draws this and it is the difference between "60% today"
   * and "60% but only after 4pm". */
  precip_hours: number[];
}

export interface WeatherWidget {
  kind: 'weather';
  /** `conditions` is the temperature view; `precip` is Apple's second tab —
   * the user asked for both ("build precipitation weather charts as well please
   * not just that one overall widget", 2026-09-23). */
  view: 'conditions' | 'precip' | 'hourly' | 'composite';
  /** Which measure an `hourly` view draws. Ignored by the other views. */
  metric: MetricId;
  place: string | null;
  summary: string | null;
  temp: number | null;
  feels_like: number | null;
  hours: WeatherHour[];
  days: WeatherDay[];
}

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'textarea';
  placeholder: string | null;
  required: boolean;
}
export interface FormWidget {
  kind: 'form';
  title: string | null;
  fields: FormField[];
  submitLabel: string;
}

export type Widget =
  | ClarifyWidget
  | CardWidget
  | MetricWidget
  | ChartWidget
  | TableWidget
  | ProgressWidget
  | LinkWidget
  | ButtonRowWidget
  | PollWidget
  | ChecklistWidget
  | CalendarWidget
  | WeatherWidget
  | FormWidget;

// --- per-kind parsers -------------------------------------------------------

function parseClarify(p: Record<string, unknown>): ClarifyWidget | null {
  const question = str(p.question);
  const clarifyId = str(p.widget_id) ?? str(p.clarify_id) ?? str(p.clarifyId);
  if (!question || !clarifyId) return null;
  const choices = arr(p.choices)
    .map((c) => str(c))
    .filter((c): c is string => c !== null);
  return { kind: 'clarify', clarifyId, question, choices, multiSelect: bool(p.multi_select) && choices.length > 0 };
}

function parseCard(p: Record<string, unknown>): CardWidget | null {
  const rows = arr(p.rows)
    .map((r) => {
      const o = obj(r);
      const label = o && str(o.label);
      if (!label) return null;
      return { label, value: (o && str(o.value)) ?? '', tone: asTone(o?.tone) };
    })
    .filter((r): r is CardRow => r !== null);
  const title = str(p.title);
  const body = str(p.body) ?? str(p.text);
  if (!title && !body && rows.length === 0) return null;
  return { kind: 'card', title, subtitle: str(p.subtitle), body, rows, tone: asTone(p.tone) };
}

function parseMetric(p: Record<string, unknown>): MetricWidget | null {
  const label = str(p.label) ?? str(p.title);
  const rawValue = p.value;
  const value = str(rawValue) ?? (num(rawValue) !== null ? String(num(rawValue)) : null);
  if (!label || value === null) return null;
  return {
    kind: 'metric',
    label,
    value,
    unit: str(p.unit),
    delta: str(p.delta) ?? (num(p.delta) !== null ? String(num(p.delta)) : null),
    deltaTone: asTone(p.delta_tone ?? p.deltaTone ?? p.tone),
    caption: str(p.caption),
  };
}

function parseChart(p: Record<string, unknown>): ChartWidget | null {
  const series = arr(p.series)
    .map((s, i) => {
      const o = obj(s);
      if (!o) return null;
      const id = str(o.id) ?? str(o.key);
      const label = str(o.label) ?? id;
      if (!id || !label) return null;
      // An unknown colour name falls back to the series ramp rather than
      // rejecting the whole chart — the data is the point, the hue is not.
      const color = asColor(o.color) ?? (`series-${(i % 7) + 1}` as TokenName);
      return { id, label, color };
    })
    .filter((s): s is ChartSeries => s !== null);
  if (series.length === 0) return null;

  const buckets = arr(p.buckets ?? p.points)
    .map((b) => {
      const o = obj(b);
      const key = o && (str(o.key) ?? str(o.label) ?? str(o.x));
      if (!o || !key) return null;
      const rawValues = obj(o.values);
      const values: Record<string, number> = {};
      if (rawValues) {
        for (const s of series) {
          const n = num(rawValues[s.id]);
          if (n !== null) values[s.id] = n;
        }
      } else {
        // Single-series shorthand: `{key, value}` instead of `{key, values}`.
        const n = num(o.value ?? o.y);
        if (n !== null) values[series[0].id] = n;
      }
      return Object.keys(values).length > 0 ? { key, values } : null;
    })
    .filter((b): b is ChartBucket => b !== null);
  if (buckets.length === 0) return null;

  const variant = str(p.variant)?.toLowerCase() === 'line' ? 'line' : 'bars';
  return { kind: 'chart', variant, title: str(p.title), caption: str(p.caption), series, buckets, unit: str(p.unit) };
}

function parseTable(p: Record<string, unknown>): TableWidget | null {
  const columns = arr(p.columns)
    .map((c) => {
      const o = obj(c);
      if (o) {
        const key = str(o.key) ?? str(o.label);
        const label = str(o.label) ?? key;
        if (!key || !label) return null;
        return { key, label, align: str(o.align) === 'right' ? ('right' as const) : ('left' as const) };
      }
      // `columns: ["Date", "Amount"]` — the shorthand a model reaches for.
      const s = str(c);
      return s ? { key: s, label: s, align: 'left' as const } : null;
    })
    .filter((c): c is TableColumn => c !== null);
  if (columns.length === 0) return null;

  const rows = arr(p.rows)
    .map((r) => {
      const out: Record<string, string> = {};
      const o = obj(r);
      if (o) {
        for (const c of columns) {
          const raw = o[c.key];
          out[c.key] = str(raw) ?? (num(raw) !== null ? String(num(raw)) : '');
        }
      } else {
        // Positional row: `[["2026-09-22", "$14"]]`.
        const cells = arr(r);
        columns.forEach((c, i) => {
          out[c.key] = str(cells[i]) ?? (num(cells[i]) !== null ? String(num(cells[i])) : '');
        });
      }
      return Object.values(out).some((v) => v !== '') ? out : null;
    })
    .filter((r): r is Record<string, string> => r !== null);
  if (rows.length === 0) return null;

  return { kind: 'table', title: str(p.title), caption: str(p.caption), columns, rows };
}

function parseProgress(p: Record<string, unknown>): ProgressWidget | null {
  const value = num(p.value);
  if (value === null) return null;
  const total = num(p.total) ?? num(p.max) ?? 100;
  if (total <= 0) return null;
  return {
    kind: 'progress',
    label: str(p.label) ?? str(p.title),
    value: Math.max(0, Math.min(value, total)),
    total,
    caption: str(p.caption),
    tone: asTone(p.tone),
  };
}

function parseLink(p: Record<string, unknown>): LinkWidget | null {
  const url = asHttpsUrl(p.url ?? p.href);
  if (!url) return null;
  return { kind: 'link', url, title: str(p.title) ?? str(p.label) ?? url, subtitle: str(p.subtitle) };
}

function parseButtons(raw: unknown): WidgetButton[] {
  return arr(raw)
    .map((b, i) => {
      const o = obj(b);
      if (o) {
        const label = str(o.label) ?? str(o.text);
        if (!label) return null;
        return { id: str(o.id) ?? `b${i}`, label, tone: asTone(o.tone ?? o.style) };
      }
      const s = str(b);
      return s ? { id: `b${i}`, label: s, tone: 'neutral' as Tone } : null;
    })
    .filter((b): b is WidgetButton => b !== null);
}

function parseButtonRow(p: Record<string, unknown>): ButtonRowWidget | null {
  const buttons = parseButtons(p.buttons ?? p.actions ?? p.options);
  if (buttons.length === 0) return null;
  return { kind: 'button_row', prompt: str(p.prompt) ?? str(p.title), buttons };
}

function parsePoll(p: Record<string, unknown>): PollWidget | null {
  const question = str(p.question) ?? str(p.title);
  if (!question) return null;
  const options = arr(p.options ?? p.choices)
    .map((o, i) => {
      const x = obj(o);
      if (x) {
        const label = str(x.label) ?? str(x.text);
        if (!label) return null;
        return { id: str(x.id) ?? `o${i}`, label, votes: num(x.votes) ?? 0 };
      }
      const s = str(o);
      return s ? { id: `o${i}`, label: s, votes: 0 } : null;
    })
    .filter((o): o is PollOption => o !== null);
  if (options.length < 2) return null;
  const selected = str(p.selected_id ?? p.selectedId);
  return {
    kind: 'poll',
    question,
    options,
    selectedId: selected && options.some((o) => o.id === selected) ? selected : null,
    closed: bool(p.closed),
  };
}

const CHECK_STATES: ChecklistState[] = ['todo', 'doing', 'done', 'blocked'];

function asChecklistState(v: unknown): ChecklistState {
  const s = str(v)?.toLowerCase();
  if (!s) return 'todo';
  if (CHECK_STATES.includes(s as ChecklistState)) return s as ChecklistState;
  if (s === 'in_progress' || s === 'in-progress' || s === 'running' || s === 'active') return 'doing';
  if (s === 'complete' || s === 'completed' || s === 'finished') return 'done';
  if (s === 'failed' || s === 'error' || s === 'stuck') return 'blocked';
  return 'todo';
}

function parseChecklist(p: Record<string, unknown>): ChecklistWidget | null {
  const items = arr(p.items ?? p.todos ?? p.steps)
    .map((it, i) => {
      const o = obj(it);
      if (o) {
        const label = str(o.label) ?? str(o.text) ?? str(o.title);
        if (!label) return null;
        // `{done: true}` is the shape a model writes when it forgets `state`.
        const state = o.state !== undefined ? asChecklistState(o.state) : bool(o.done) ? 'done' : 'todo';
        return { id: str(o.id) ?? `i${i}`, label, state, note: str(o.note) };
      }
      const s = str(it);
      return s ? { id: `i${i}`, label: s, state: 'todo' as ChecklistState, note: null } : null;
    })
    .filter((it): it is ChecklistItem => it !== null);
  if (items.length === 0) return null;
  return { kind: 'checklist', title: str(p.title), items };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `"14:30"`, `"2026-09-22T14:30:00Z"`, or `870` — all mean 14:30. */
export function asMinuteOfDay(v: unknown): number | null {
  const n = num(v);
  if (n !== null && typeof v === 'number') return n >= 0 && n <= 1440 ? n : null;
  const s = str(v);
  if (!s) return null;
  const hhmm = /(\d{1,2}):(\d{2})/.exec(s);
  if (!hhmm) return null;
  const h = Number(hhmm[1]);
  const m = Number(hhmm[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

function parseCalendar(p: Record<string, unknown>): CalendarWidget | null {
  const days = arr(p.days)
    .map((d) => {
      const o = obj(d);
      const date = o && str(o.date);
      if (!o || !date || !ISO_DATE.test(date)) return null;
      const events = arr(o.events)
        .map((e, i) => {
          const x = obj(e);
          const title = x && (str(x.title) ?? str(x.label) ?? str(x.summary));
          if (!x || !title) return null;
          return {
            id: str(x.id) ?? `${date}-${i}`,
            title,
            startMin: asMinuteOfDay(x.start ?? x.start_time ?? x.startMin),
            endMin: asMinuteOfDay(x.end ?? x.end_time ?? x.endMin),
            location: str(x.location),
            tone: asTone(x.tone),
          };
        })
        .filter((e): e is CalendarEvent => e !== null)
        .sort((a, b) => (a.startMin ?? -1) - (b.startMin ?? -1));
      return { date, label: str(o.label), events };
    })
    .filter((d): d is CalendarDay => d !== null);
  if (days.length === 0) return null;
  // A month of days is unreadable as a list of rows, and one day is
  // unreadable as a grid — the shape follows what was asked for, then what
  // arrived (the user, 2026-09-22: "add a week and month view ... so it can
  // visualize over longer periods more easily").
  const asked = str(p.view)?.toLowerCase();
  const view =
    asked === 'day' || days.length === 1
      ? 'day'
      : asked === 'month' || days.length > 10
        ? 'month'
        : 'week';
  return { kind: 'calendar', view, title: str(p.title), days };
}

/** Hours and days are both "a label, a sky, and some numbers", but they carry
 * different numbers, so they are read separately rather than through one
 * shape that is half-empty either way. A row without a usable temperature is
 * dropped: an hour drawn at 0° because the field was missing is worse than an
 * hour that is not drawn. */
function parseWeather(p: Record<string, unknown>): WeatherWidget | null {
  const hours = arr(p.hours)
    .map((h) => {
      const o = obj(h);
      const temp = o && num(o.temp ?? o.temperature);
      if (!o || temp === null) return null;
      return {
        label: str(o.label) ?? str(o.time) ?? '',
        temp,
        condition: normaliseCondition(o.condition ?? o.icon ?? o.summary, o.night === true),
        precip: Math.max(0, Math.min(100, num(o.precip ?? o.precip_chance ?? o.chance) ?? 0)),
        night: o.night === true,
        feels_like: num(o.feels_like ?? o.feelsLike ?? o.apparent),
        wind: num(o.wind ?? o.wind_speed ?? o.windSpeed),
        humidity: num(o.humidity ?? o.rh),
        uv: num(o.uv ?? o.uv_index ?? o.uvIndex),
        cloud: num(o.cloud ?? o.cloud_cover ?? o.cloudCover),
      };
    })
    .filter((h): h is WeatherHour => h !== null);

  const days = arr(p.days)
    .map((d) => {
      const o = obj(d);
      if (!o) return null;
      const low = num(o.low ?? o.min ?? o.temp_min);
      const high = num(o.high ?? o.max ?? o.temp_max);
      const chance = num(o.precip ?? o.precip_chance ?? o.chance);
      const precip_in = num(o.precip_in ?? o.precip_amount ?? o.inches);
      const precip_hours = arr(o.precip_hours ?? o.hourly_precip)
        .map((h) => num(h))
        .filter((h): h is number => h !== null)
        .map((h) => Math.max(0, Math.min(100, h)))
        .slice(0, 24);
      const range = low !== null && high !== null;
      // A day is worth a row when it says something: a temperature range, or
      // anything about rain. The precipitation view's days carry no
      // temperatures at all, and requiring them refused the whole widget
      // ("Could not draw this weather", the user 2026-09-28).
      if (!range && chance === null && precip_in === null && precip_hours.length === 0) return null;
      return {
        label: str(o.label) ?? str(o.day) ?? str(o.date) ?? '',
        low: range ? low : null,
        high: range ? high : null,
        condition: normaliseCondition(o.condition ?? o.icon ?? o.summary),
        precip: Math.max(0, Math.min(100, chance ?? 0)),
        precip_in,
        precip_hours,
      };
    })
    .filter((d): d is WeatherDay => d !== null);

  const temp = num(p.temp ?? p.temperature);
  if (hours.length === 0 && days.length === 0 && temp === null) return null;
  const asked = str(p.view)?.toLowerCase();
  const metric = metricOf(p.metric) ?? 'temp';
  const view =
    asked === 'precip' || asked === 'precipitation' || asked === 'rain'
      ? 'precip'
      : asked === 'composite' || asked === 'all'
        ? 'composite'
        : asked === 'hourly' || (asked === undefined && false)
          ? 'hourly'
          : 'conditions';
  return {
    kind: 'weather',
    view,
    metric,
    place: str(p.place) ?? str(p.location) ?? null,
    summary: str(p.summary) ?? str(p.caption) ?? null,
    temp,
    feels_like: num(p.feels_like ?? p.feelsLike ?? p.apparent),
    hours,
    days,
  };
}

function parseForm(p: Record<string, unknown>): FormWidget | null {
  const fields = arr(p.fields)
    .map((f, i) => {
      const o = obj(f);
      const label = o && (str(o.label) ?? str(o.name));
      if (!o || !label) return null;
      const rawType = str(o.type)?.toLowerCase();
      const type =
        rawType === 'number' ? 'number' : rawType === 'textarea' || rawType === 'multiline' ? 'textarea' : 'text';
      return { id: str(o.id) ?? str(o.name) ?? `f${i}`, label, type, placeholder: str(o.placeholder), required: bool(o.required) };
    })
    .filter((f): f is FormField => f !== null);
  if (fields.length === 0) return null;
  return { kind: 'form', title: str(p.title), fields, submitLabel: str(p.submit_label ?? p.submitLabel) ?? 'Submit' };
}

const PARSERS: Record<WidgetKind, (p: Record<string, unknown>) => Widget | null> = {
  clarify: parseClarify,
  card: parseCard,
  metric: parseMetric,
  chart: parseChart,
  table: parseTable,
  progress: parseProgress,
  link: parseLink,
  button_row: parseButtonRow,
  poll: parsePoll,
  checklist: parseChecklist,
  calendar: parseCalendar,
  weather: parseWeather,
  form: parseForm,
};

/** `ButtonRow`, `button-row`, `BUTTON_ROW` all name the same kind. */
export function normaliseKind(raw: unknown): WidgetKind | null {
  const s = str(raw);
  if (!s) return null;
  const k = s
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
  const aliases: Record<string, WidgetKind> = {
    buttons: 'button_row',
    actions: 'button_row',
    todo: 'checklist',
    todos: 'checklist',
    plan: 'checklist',
    tasks: 'checklist',
    schedule: 'calendar',
    forecast: 'weather',
    agenda: 'calendar',
    bar_chart: 'chart',
    line_chart: 'chart',
    stat: 'metric',
  };
  // `in` walks the prototype chain, so `__proto__`, `constructor`, `toString`
  // and friends all passed this gate; `PARSERS['__proto__']` is not a function
  // and threw, and `PARSERS['constructor']` returned the raw props object.
  // Both are payloads an agent can write.
  if (Object.prototype.hasOwnProperty.call(PARSERS, k)) return k as WidgetKind;
  return Object.prototype.hasOwnProperty.call(aliases, k) ? aliases[k] : null;
}

/**
 * The transcript's entry point. Takes the raw `widget` part straight off the
 * wire and returns a rendered-ready value, or `null` when the payload is not
 * something this build can draw — the caller shows a one-line fallback rather
 * than a blank space, so a malformed widget is visible instead of silent.
 */
export function parseWidget(part: { kind?: string; [key: string]: unknown }): Widget | null {
  const kind = normaliseKind(part.kind);
  if (!kind) return null;
  // `props` is the documented envelope; a model that flattens its fields onto
  // the part itself is common enough to be worth accepting.
  const props = obj(part.props) ?? part;
  return PARSERS[kind](props as Record<string, unknown>);
}
