import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Activity,
  Check,
  CircleCheck,
  Droplet,
  Dumbbell,
  Flame,
  Leaf,
  RotateCcw,
  Salad,
  Scale,
  Sparkles,
  SunMedium,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Router as WouterRouter, Switch, useLocation } from 'wouter';

const queryClient = new QueryClient();
const PROGRAM_LENGTH = 21;
const REST_DAYS = [6, 7, 13, 14, 20, 21];
const PROFILE_KEY = 'leveza21-profile';
const CHECKINS_KEY = 'leveza21-checkins';

type Profile = {
  name: string;
  startDate: string;
  startWeight: number | null;
  goalWeight: number | null;
  streak?: number;
  lastCheckinDate?: string;
  cyclesCompleted?: number;
};

type Checkin = {
  treino: boolean;
  alimentacao: boolean;
  agua: number;
  energia: number;
  peso: string;
};

type Exercise = { nome: string; detalhe: string };

const EMPTY_CHECKIN: Checkin = {
  treino: false,
  alimentacao: false,
  agua: 0,
  energia: 0,
  peso: '',
};

const TREINO_A: Exercise[] = [
  { nome: 'Agachamento livre', detalhe: 'corpo todo' },
  { nome: 'Afundo alternado', detalhe: 'cada perna' },
  { nome: 'Ponte de glúteo', detalhe: '' },
  { nome: 'Prancha', detalhe: '' },
  { nome: 'Abdominal bicicleta', detalhe: '' },
];

const TREINO_B: Exercise[] = [
  { nome: 'Flexão de braço', detalhe: 'apoiada no joelho se precisar' },
  { nome: 'Remada invertida ou flexão declinada', detalhe: '' },
  { nome: 'Prancha lateral', detalhe: 'cada lado' },
  { nome: 'Superman', detalhe: '' },
  { nome: 'Abdominal remador', detalhe: '' },
];

const NUTRITION_TIPS = [
  'Comece o dia com um copo de água antes do café da manhã.',
  'Inclua uma fonte de proteína em cada refeição principal.',
  'Troque um refrigerante do dia por água ou chá gelado sem açúcar.',
  'Mastigue devagar e preste atenção ao sinal de saciedade.',
  'Adicione uma porção de vegetais no almoço e no jantar.',
  'Prepare uma refeição em casa em vez de pedir delivery.',
  'Descanse bem hoje — o sono também faz parte do processo.',
  'Leve um lanche saudável para não chegar faminto nas refeições.',
  'Reduza o açúcar do café ou substitua por uma opção natural.',
  'Experimente trocar o pão branco por uma versão integral.',
  'Beba água ao longo do dia, não só quando sentir sede.',
  'Escolha frutas como sobremesa hoje.',
  'Evite fazer outras coisas enquanto come — foque na refeição.',
  'Dia de descanso: aproveite para planejar as refeições da semana.',
  'Aumente um pouco a porção de vegetais no prato principal.',
  'Prefira alimentos assados ou grelhados a fritos hoje.',
  'Tente esperar 10 minutos antes de repetir o prato.',
  'Reduza um item ultraprocessado da sua lista de hoje.',
  'Organize o café da manhã de amanhã com antecedência.',
  'Note como está se sentindo comparado ao dia 1 — celebre o progresso.',
  'Dia de descanso: reflita sobre o hábito que mais evoluiu nesses 21 dias.',
];

function todayISO(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function dayNumberFor(startDate: string, dateISO: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const target = new Date(`${dateISO}T00:00:00`);
  return Math.round((target.getTime() - start.getTime()) / 86400000) + 1;
}

function isCompleted(entry?: Checkin) {
  return Boolean(entry?.treino || entry?.alimentacao || (entry?.energia && entry.energia > 0));
}

function roundsFor(week: number) {
  if (week === 1) return '3 séries de 30-45s ou 12-15 repetições';
  if (week === 2) return '4 séries de 30-45s ou 12-15 repetições';
  return '4-5 séries, aumentando o ritmo mantendo a boa forma';
}

function planFor(day: number) {
  const week = Math.ceil(day / 7);
  const isRest = REST_DAYS.includes(day);
  const isA = day % 2 !== 0;
  return {
    week,
    isRest,
    treino: isRest ? null : isA ? TREINO_A : TREINO_B,
    treinoNome: isRest ? null : isA ? 'Treino A — Inferior e core' : 'Treino B — Superior e core',
    rounds: roundsFor(week),
  };
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The interface remains usable if browser storage is unavailable.
  }
}

function removeStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing else is needed for a best-effort local reset.
  }
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Home() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checkins, setCheckins] = useState<Record<string, Checkin>>({});
  const [formName, setFormName] = useState('');
  const [formWeight, setFormWeight] = useState('');
  const [formGoal, setFormGoal] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [saved, setSaved] = useState(false);
  const today = todayISO();

  useEffect(() => {
    const storedProfile = readStorage<Profile | null>(PROFILE_KEY, null);
    const storedCheckins = readStorage<Record<string, Checkin>>(CHECKINS_KEY, {});
    setProfile(storedProfile);
    setCheckins(storedCheckins);
    setLoading(false);
  }, []);

  const dayNumber = profile ? dayNumberFor(profile.startDate, today) : null;
  const [draft, setDraft] = useState<Checkin>(EMPTY_CHECKIN);

  useEffect(() => {
    if (profile) {
      setDraft({ ...EMPTY_CHECKIN, ...(checkins[today] || {}) });
    }
  }, [profile, checkins, today]);

  const startProgram = () => {
    if (!formName.trim()) return;
    const newProfile: Profile = {
      name: formName.trim(),
      startDate: today,
      startWeight: formWeight ? Number.parseFloat(formWeight) : null,
      goalWeight: formGoal ? Number.parseFloat(formGoal) : null,
    };
    setProfile(newProfile);
    writeStorage(PROFILE_KEY, newProfile);
  };

  const saveCheckin = () => {
    if (!profile) return;
    const updatedCheckins = { ...checkins, [today]: draft };
    const currentStreak = profile.streak || 0;
    const nextStreak =
      profile.lastCheckinDate === today
        ? currentStreak
        : profile.lastCheckinDate === todayISO(-1)
          ? currentStreak + 1
          : 1;
    const updatedProfile = { ...profile, streak: nextStreak, lastCheckinDate: today };
    setCheckins(updatedCheckins);
    setProfile(updatedProfile);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
    writeStorage(CHECKINS_KEY, updatedCheckins);
    writeStorage(PROFILE_KEY, updatedProfile);
  };

  const resetProgram = () => {
    setProfile(null);
    setCheckins({});
    setConfirmingReset(false);
    setFormName('');
    setFormWeight('');
    setFormGoal('');
    removeStorage(PROFILE_KEY);
    removeStorage(CHECKINS_KEY);
  };

  const weightData = useMemo(() => {
    if (!profile) return [];
    return Object.entries(checkins)
      .filter(([, entry]) => entry?.peso)
      .map(([date, entry]) => ({
        day: dayNumberFor(profile.startDate, date),
        peso: Number.parseFloat(entry.peso),
      }))
      .sort((a, b) => a.day - b.day);
  }, [checkins, profile]);

  const daysDone = profile
    ? Array.from({ length: PROGRAM_LENGTH }, (_, index) => index + 1).filter((number) => {
        const date = todayISO(number - (dayNumber || 1));
        return isCompleted(checkins[date]);
      }).length
    : 0;
  const streak = profile?.streak || 0;

  if (loading) return <LoadingScreen />;
  if (!profile) {
    return (
      <Onboarding
        formName={formName}
        formWeight={formWeight}
        formGoal={formGoal}
        setFormName={setFormName}
        setFormWeight={setFormWeight}
        setFormGoal={setFormGoal}
        startProgram={startProgram}
      />
    );
  }

  if ((dayNumber || 1) > PROGRAM_LENGTH) {
    return (
      <Completion
        profile={profile}
        checkins={checkins}
        weightData={weightData}
        daysDone={daysDone}
        streak={streak}
        startNewCycle={() => {
          const latestWeight = weightData.length ? weightData[weightData.length - 1].peso : profile.startWeight;
          const updatedProfile = {
            ...profile,
            startDate: today,
            cyclesCompleted: (profile.cyclesCompleted || 0) + 1,
            startWeight: latestWeight,
          };
          setProfile(updatedProfile);
          setCheckins({});
          writeStorage(PROFILE_KEY, updatedProfile);
          writeStorage(CHECKINS_KEY, {});
        }}
      />
    );
  }

  const plan = planFor(Math.min(dayNumber || 1, PROGRAM_LENGTH));
  const tip = NUTRITION_TIPS[Math.min(dayNumber || 1, PROGRAM_LENGTH) - 1];

  return (
    <main className="app-shell page-enter">
      <div className="mx-auto w-full max-w-[1120px] px-5 pb-16 pt-7 sm:px-8 lg:px-10 lg:pt-10">
        <header className="mb-8 flex items-start justify-between gap-5 lg:mb-10">
          <div>
            <p className="eyebrow mb-3" data-testid="text-greeting">Olá, {profile.name}</p>
            <h1 className="display-font text-[2.75rem] leading-[.95] tracking-[-.04em] text-foreground sm:text-6xl" data-testid="text-day-title">
              Dia {dayNumber}
              <span className="ml-2 text-xl font-medium tracking-normal text-muted-foreground sm:text-2xl">de {PROGRAM_LENGTH}</span>
            </h1>
            <p className="mt-3 text-sm text-muted-foreground" data-testid="text-cycle-label">
              Reset Metabólico{profile.cyclesCompleted ? ` — Ciclo ${profile.cyclesCompleted + 1}` : ''}
            </p>
          </div>
          <button
            className="focus-ring button-lift mt-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground"
            onClick={() => setConfirmingReset(true)}
            aria-label="Recomeçar programa"
            data-testid="button-open-reset"
          >
            <RotateCcw size={17} strokeWidth={1.8} />
          </button>
        </header>

        {confirmingReset && (
          <section className="mb-7 rounded-2xl border border-accent/40 bg-card p-5 shadow-sm page-enter" data-testid="dialog-reset-confirmation">
            <p className="mb-4 text-sm leading-relaxed text-foreground">Isso apaga todo o seu progresso e recomeça do dia 1. Tem certeza?</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button className="focus-ring button-lift rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-card" onClick={resetProgram} data-testid="button-confirm-reset">Recomeçar</button>
              <button className="focus-ring rounded-xl border border-border bg-transparent px-4 py-3 text-sm text-foreground" onClick={() => setConfirmingReset(false)} data-testid="button-cancel-reset">Cancelar</button>
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-6">
            <section className="glass-card rounded-[1.5rem] p-5 sm:p-7" data-testid="card-todays-plan">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="eyebrow mb-2 text-muted-foreground">Plano de hoje</p>
                  <h2 className="display-font text-2xl tracking-[-.025em]">Um passo de cada vez.</h2>
                </div>
                <div className="hidden h-11 w-11 items-center justify-center rounded-2xl bg-secondary/10 text-secondary sm:flex">
                  {plan.isRest ? <SunMedium size={21} strokeWidth={1.7} /> : <Dumbbell size={21} strokeWidth={1.7} />}
                </div>
              </div>
              {plan.isRest ? (
                <div className="rounded-2xl bg-secondary/10 p-4 text-sm font-semibold text-secondary" data-testid="status-rest-day">
                  Dia de descanso — sem treino
                </div>
              ) : (
                <div className="rounded-2xl bg-primary/8 p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-primary"><Dumbbell size={19} strokeWidth={1.8} /></span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold" data-testid="text-workout-name">{plan.treinoNome}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{plan.rounds}</p>
                    </div>
                  </div>
                  <ul className="mt-4 grid gap-2 border-t border-primary/15 pt-4 text-sm leading-relaxed sm:grid-cols-2">
                    {plan.treino?.map((exercise) => (
                      <li key={exercise.nome} className="flex gap-2 text-foreground">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{exercise.nome}{exercise.detalhe ? <span className="text-muted-foreground"> — {exercise.detalhe}</span> : null}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-5 flex gap-3 border-t border-border pt-5">
                <Salad className="mt-0.5 shrink-0 text-secondary" size={19} strokeWidth={1.8} />
                <p className="text-sm leading-relaxed text-foreground" data-testid="text-daily-tip">{tip}</p>
              </div>
            </section>

            <section className="glass-card rounded-[1.5rem] p-5 sm:p-7" data-testid="card-checkin">
              <div className="mb-5 flex items-end justify-between gap-3">
                <div>
                  <p className="eyebrow mb-2 text-muted-foreground">Ritual de hoje</p>
                  <h2 className="display-font text-2xl tracking-[-.025em]">Seu check-in</h2>
                </div>
                <span className="text-xs text-muted-foreground">leva menos de 1 min</span>
              </div>
              <ToggleRow icon={<Dumbbell size={18} />} label="Treino feito" active={draft.treino} onClick={() => setDraft({ ...draft, treino: !draft.treino })} testId="toggle-workout" />
              <ToggleRow icon={<Salad size={18} />} label="Plano alimentar seguido" active={draft.alimentacao} onClick={() => setDraft({ ...draft, alimentacao: !draft.alimentacao })} testId="toggle-nutrition" />

              <div className="border-t border-border py-5">
                <div className="mb-3 flex items-center gap-3">
                  <Droplet size={18} className="text-muted-foreground" strokeWidth={1.8} />
                  <span className="text-sm font-medium">Copos de água</span>
                  <span className="ml-auto font-semibold text-secondary" data-testid="text-water-count">{draft.agua}</span>
                </div>
                <div className="flex gap-1.5" role="group" aria-label="Copos de água">
                  {Array.from({ length: 8 }, (_, index) => index + 1).map((number) => (
                    <button
                      key={number}
                      className={`focus-ring h-8 flex-1 rounded-lg transition-colors ${number <= draft.agua ? 'bg-secondary' : 'bg-muted hover:bg-secondary/25'}`}
                      onClick={() => setDraft({ ...draft, agua: number === draft.agua ? number - 1 : number })}
                      aria-label={`${number} ${number === 1 ? 'copo' : 'copos'} de água`}
                      aria-pressed={number <= draft.agua}
                      data-testid={`button-water-${number}`}
                    />
                  ))}
                </div>
              </div>

              <div className="border-t border-border py-5">
                <div className="mb-3 flex items-center gap-3">
                  <Zap size={18} className="text-muted-foreground" strokeWidth={1.8} />
                  <span className="text-sm font-medium">Nível de energia</span>
                </div>
                <div className="flex gap-1.5" role="group" aria-label="Nível de energia">
                  {[1, 2, 3, 4, 5].map((number) => (
                    <button
                      key={number}
                      className={`focus-ring flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${draft.energia === number ? 'bg-primary text-card' : 'bg-muted text-muted-foreground hover:bg-primary/15'}`}
                      onClick={() => setDraft({ ...draft, energia: number })}
                      aria-label={`Energia ${number} de 5`}
                      aria-pressed={draft.energia === number}
                      data-testid={`button-energy-${number}`}
                    >
                      {number}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block border-t border-border pt-5 text-sm font-medium" htmlFor="weight-today">
                <span className="mb-3 flex items-center gap-3"><Scale size={18} className="text-muted-foreground" strokeWidth={1.8} />Peso de hoje (kg) — opcional</span>
                <input
                  id="weight-today"
                  className="focus-ring w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
                  type="number"
                  inputMode="decimal"
                  value={draft.peso}
                  onChange={(event) => setDraft({ ...draft, peso: event.target.value })}
                  placeholder="Ex: 76.5"
                  data-testid="input-today-weight"
                />
              </label>
              <button
                className={`focus-ring button-lift mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold text-card ${saved ? 'bg-secondary' : 'bg-primary'}`}
                onClick={saveCheckin}
                data-testid="button-save-checkin"
              >
                {saved ? <><CircleCheck size={18} />Check-in salvo</> : 'Salvar check-in de hoje'}
              </button>
            </section>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-7">
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={<Flame size={18} />} label="Sequência" value={`${streak} dia${streak === 1 ? '' : 's'}`} tone="primary" testId="card-streak" />
              <StatCard icon={<Check size={18} />} label="Dias completos" value={`${daysDone}/${PROGRAM_LENGTH}`} tone="secondary" testId="card-completion" />
            </div>

            <section className="glass-card rounded-[1.5rem] p-5 sm:p-6" data-testid="card-path">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="eyebrow mb-2 text-muted-foreground">21 dias</p>
                  <h2 className="display-font text-2xl tracking-[-.025em]">Sua trilha</h2>
                </div>
                <Activity size={20} className="text-primary" strokeWidth={1.8} />
              </div>
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: PROGRAM_LENGTH }, (_, index) => index + 1).map((number) => {
                  const date = todayISO(number - (dayNumber || 1));
                  const completed = isCompleted(checkins[date]);
                  const isToday = number === dayNumber;
                  const isPastMissed = number < (dayNumber || 1) && !completed;
                  return (
                    <div
                      key={number}
                      className={`flex aspect-square items-center justify-center rounded-lg text-xs font-bold transition-transform ${completed ? 'bg-secondary text-card' : isToday ? 'border-2 border-primary bg-card text-foreground' : isPastMissed ? 'border border-dashed border-border bg-transparent text-muted-foreground' : 'bg-muted text-muted-foreground'}`}
                      aria-label={`Dia ${number}${completed ? ', completo' : ''}${isToday ? ', hoje' : ''}`}
                      data-testid={`path-day-${number}`}
                    >
                      {completed ? <Check size={14} strokeWidth={2.5} /> : number}
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-secondary" />completo</span>
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full border-2 border-primary" />hoje</span>
              </div>
            </section>

            {weightData.length > 1 && <WeightChart data={weightData} />}
          </aside>
        </div>
      </div>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="app-shell flex min-h-[100dvh] items-center justify-center px-5">
      <div className="w-full max-w-[420px] space-y-5" aria-label="Carregando Leveza 21" data-testid="loading-state">
        <div className="skeleton h-3 w-28" />
        <div className="skeleton h-12 w-64" />
        <div className="skeleton h-4 w-80 max-w-full" />
        <div className="skeleton h-48 w-full rounded-3xl" />
      </div>
    </main>
  );
}

type OnboardingProps = {
  formName: string;
  formWeight: string;
  formGoal: string;
  setFormName: (value: string) => void;
  setFormWeight: (value: string) => void;
  setFormGoal: (value: string) => void;
  startProgram: () => void;
};

function Onboarding({ formName, formWeight, formGoal, setFormName, setFormWeight, setFormGoal, startProgram }: OnboardingProps) {
  return (
    <main className="app-shell page-enter min-h-[100dvh]">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1120px] items-center gap-12 px-5 py-8 sm:px-8 lg:grid-cols-[1fr_440px] lg:gap-20 lg:px-10 lg:py-14">
        <section className="hidden lg:block">
          <div className="relative min-h-[510px] overflow-hidden rounded-[2.5rem] bg-secondary p-12 text-card shadow-[0_24px_60px_hsl(96_22%_40%_/_0.16)]">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[26px] border-card/10" />
            <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-primary/25" />
            <div className="relative flex h-full min-h-[426px] flex-col justify-between">
              <div>
                <div className="mb-12 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-card/15"><Leaf size={21} /></span>
                  <span className="text-sm font-bold tracking-[.16em]">LEVEZA 21</span>
                </div>
                <p className="mb-5 max-w-sm text-sm font-semibold uppercase tracking-[.17em] text-card/65">Um começo que cabe no seu dia</p>
                <h1 className="display-font max-w-md text-6xl leading-[.97] tracking-[-.04em]">Volte para o seu ritmo.</h1>
              </div>
              <div className="max-w-sm">
                <div className="mb-5 flex items-center gap-3">
                  <span className="h-px w-10 bg-card/45" />
                  <span className="text-xs uppercase tracking-[.14em] text-card/65">21 dias de presença</span>
                </div>
                <p className="text-sm leading-relaxed text-card/75">Treino em casa, escolhas possíveis e um pequeno registro para lembrar que constância também pode ser leve.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full max-w-[440px] justify-self-center">
          <div className="mb-10 lg:hidden">
            <div className="mb-7 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary text-card"><Leaf size={21} /></span>
              <span className="text-sm font-bold tracking-[.16em] text-secondary">LEVEZA 21</span>
            </div>
          </div>
          <p className="eyebrow mb-3">Método Leveza 21</p>
          <h1 className="display-font text-5xl leading-[.98] tracking-[-.04em] sm:text-6xl" data-testid="text-onboarding-title">Reset Metabólico</h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">21 dias de treino em casa (sem equipamentos), orientações alimentares diárias e um check-in para acompanhar sua consistência.</p>

          <form className="mt-9" onSubmit={(event) => { event.preventDefault(); startProgram(); }}>
            <Field label="Como podemos te chamar?" id="name" value={formName} onChange={setFormName} placeholder="Seu nome" testId="input-name" required />
            <Field label="Peso inicial (kg) — opcional" id="weight" value={formWeight} onChange={setFormWeight} placeholder="Ex: 78" type="number" testId="input-start-weight" />
            <Field label="Meta de peso (kg) — opcional" id="goal" value={formGoal} onChange={setFormGoal} placeholder="Ex: 72" type="number" testId="input-goal-weight" />
            <button
              className="focus-ring button-lift mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-sm font-bold text-card disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              disabled={!formName.trim()}
              type="submit"
              data-testid="button-start-program"
            >
              Começar o dia 1 <Sparkles size={17} strokeWidth={1.8} />
            </button>
          </form>
          <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">Programa educativo de exercícios de baixo impacto e hábitos alimentares. Não substitui orientação médica ou nutricional individual — consulte um profissional de saúde antes de iniciar, especialmente se tiver alguma condição pré-existente.</p>
        </section>
      </div>
    </main>
  );
}

type FieldProps = {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
  testId: string;
};

function Field({ label, id, value, onChange, placeholder, type = 'text', required, testId }: FieldProps) {
  return (
    <label className="mb-5 block text-sm font-medium" htmlFor={id}>
      <span className="mb-2 block text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        id={id}
        className="focus-ring w-full rounded-xl border border-input bg-card px-4 py-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        data-testid={testId}
      />
    </label>
  );
}

function StatCard({ icon, label, value, tone, testId }: { icon: ReactNode; label: string; value: string; tone: 'primary' | 'secondary'; testId: string }) {
  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5" data-testid={testId}>
      <div className={`mb-3 flex items-center gap-2 ${tone === 'primary' ? 'text-primary' : 'text-secondary'}`}>
        {icon}
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      </div>
      <span className="display-font text-[1.65rem] tracking-[-.03em]" data-testid={`${testId}-value`}>{value}</span>
    </div>
  );
}

function ToggleRow({ icon, label, active, onClick, testId }: { icon: ReactNode; label: string; active: boolean; onClick: () => void; testId: string }) {
  return (
    <button
      className="focus-ring flex w-full items-center gap-3 border-b border-border py-3 text-left transition-colors hover:bg-primary/5"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
    >
      <span className={active ? 'text-secondary' : 'text-muted-foreground'}>{icon}</span>
      <span className="text-sm font-medium">{label}</span>
      <span className={`ml-auto flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${active ? 'bg-secondary text-card' : 'bg-muted text-transparent'}`}>
        <Check size={14} strokeWidth={2.6} />
      </span>
    </button>
  );
}

function WeightChart({ data }: { data: Array<{ day: number; peso: number }> }) {
  return (
    <section className="glass-card rounded-[1.5rem] p-5" data-testid="card-weight-chart">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="eyebrow mb-2 text-muted-foreground">Seu corpo, seu tempo</p>
          <h2 className="display-font text-2xl tracking-[-.025em]">Evolução do peso</h2>
        </div>
        <Scale size={20} className="text-primary" strokeWidth={1.8} />
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={38} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} labelFormatter={(day) => `Dia ${day}`} formatter={(value) => [`${value} kg`, 'Peso']} />
            <Line type="monotone" dataKey="peso" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3.5, fill: 'hsl(var(--primary))', strokeWidth: 0 }} activeDot={{ r: 5, fill: 'hsl(var(--secondary))' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Completion({ profile, checkins, weightData, daysDone, streak, startNewCycle }: { profile: Profile; checkins: Record<string, Checkin>; weightData: Array<{ day: number; peso: number }>; daysDone: number; streak: number; startNewCycle: () => void }) {
  const cycleNumber = (profile.cyclesCompleted || 0) + 1;
  const startWeight = profile.startWeight;
  const lastWeight = weightData.length ? weightData[weightData.length - 1].peso : null;
  const delta = startWeight && lastWeight ? (lastWeight - startWeight).toFixed(1) : null;

  return (
    <main className="app-shell page-enter min-h-[100dvh]">
      <div className="mx-auto w-full max-w-[720px] px-5 pb-16 pt-10 sm:px-8 sm:pt-16">
        <div className="mb-9 flex items-center justify-between">
          <div className="flex items-center gap-3 text-secondary">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary text-card"><Leaf size={20} /></span>
            <span className="text-sm font-bold tracking-[.16em]">LEVEZA 21</span>
          </div>
          <Trophy className="text-primary" size={23} strokeWidth={1.7} />
        </div>
        <p className="eyebrow mb-3">Ciclo {cycleNumber} concluído</p>
        <h1 className="display-font max-w-xl text-5xl leading-[.98] tracking-[-.04em] sm:text-7xl" data-testid="text-completion-title">21 dias, {profile.name}.</h1>
        <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted-foreground">Você chegou até aqui. Isso já coloca você à frente de quem só pensa em começar.</p>

        <div className="mt-9 grid grid-cols-2 gap-3">
          <StatCard icon={<Check size={18} />} label="Dias completos" value={`${daysDone}/${PROGRAM_LENGTH}`} tone="secondary" testId="completion-days" />
          <StatCard icon={<Flame size={18} />} label="Sequência" value={`${streak} dia${streak === 1 ? '' : 's'}`} tone="primary" testId="completion-streak" />
        </div>

        {delta !== null && (
          <section className="glass-card mt-3 rounded-2xl p-5" data-testid="card-cycle-weight">
            <p className="eyebrow mb-3 text-muted-foreground">Peso no ciclo</p>
            <div className="flex items-end justify-between gap-4">
              <span className="text-sm text-muted-foreground">{startWeight} kg <span className="px-1 text-border">→</span> {lastWeight} kg</span>
              <span className={`display-font text-2xl ${Number(delta) <= 0 ? 'text-secondary' : 'text-foreground'}`}>{Number(delta) > 0 ? '+' : ''}{delta} kg</span>
            </div>
          </section>
        )}

        <section className="mt-9" data-testid="completion-path">
          <p className="eyebrow mb-3 text-muted-foreground">Sua trilha</p>
          <div className="grid grid-cols-7 gap-2 sm:gap-3">
            {Array.from({ length: PROGRAM_LENGTH }, (_, index) => index + 1).map((number) => {
              const date = todayISO(number - 22);
              const completed = isCompleted(checkins[date]);
              return (
                <div key={number} className={`flex aspect-square items-center justify-center rounded-xl text-xs font-bold ${completed ? 'bg-secondary text-card' : 'bg-muted text-muted-foreground'}`} data-testid={`completion-day-${number}`}>
                  {completed ? <Check size={14} /> : number}
                </div>
              );
            })}
          </div>
        </section>

        <button className="focus-ring button-lift mt-10 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-sm font-bold text-card" onClick={startNewCycle} data-testid="button-new-cycle">
          <RotateCcw size={17} strokeWidth={1.8} />Começar novo ciclo
        </button>
        <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">Seu check-in diário zera, mas sua sequência de {streak} dia{streak === 1 ? '' : 's'} continua.</p>
      </div>
    </main>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;