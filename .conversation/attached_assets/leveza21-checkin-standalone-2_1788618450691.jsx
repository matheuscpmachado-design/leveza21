import { useState, useEffect, useCallback } from "react";
import { Dumbbell, Droplet, Salad, Zap, Check, Flame, RotateCcw, Scale } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const theme = {
  bg: "#F3EFE4",
  surface: "#FFFFFF",
  surfaceMuted: "#EAE4D4",
  text: "#2B2E26",
  textMuted: "#6B6A5D",
  amber: "#C2793A",
  amberSoft: "#EBD3B4",
  sage: "#5B7A5A",
  sageSoft: "#DCE5D6",
  brick: "#A64B3F",
  border: "#DDD5C1",
};

const font = {
  display: "'Fraunces', Georgia, serif",
  body: "'Inter', system-ui, sans-serif",
};

const PROGRAM_LENGTH = 21;

const REST_DAYS = [6, 7, 13, 14, 20, 21];

const TREINO_A = [
  { nome: "Agachamento livre", detalhe: "corpo todo" },
  { nome: "Afundo alternado", detalhe: "cada perna" },
  { nome: "Ponte de glúteo", detalhe: "" },
  { nome: "Prancha", detalhe: "" },
  { nome: "Abdominal bicicleta", detalhe: "" },
];
const TREINO_B = [
  { nome: "Flexão de braço", detalhe: "apoiada no joelho se precisar" },
  { nome: "Remada invertida ou flexão declinada", detalhe: "" },
  { nome: "Prancha lateral", detalhe: "cada lado" },
  { nome: "Superman", detalhe: "" },
  { nome: "Abdominal remador", detalhe: "" },
];

function roundsFor(week) {
  if (week === 1) return "3 séries de 30-45s ou 12-15 repetições";
  if (week === 2) return "4 séries de 30-45s ou 12-15 repetições";
  return "4-5 séries, aumentando o ritmo mantendo a boa forma";
}

function planFor(day) {
  const week = Math.ceil(day / 7);
  const isRest = REST_DAYS.includes(day);
  const isA = day % 2 !== 0;
  return {
    week,
    isRest,
    treino: isRest ? null : isA ? TREINO_A : TREINO_B,
    treinoNome: isRest ? null : isA ? "Treino A — Inferior e core" : "Treino B — Superior e core",
    rounds: roundsFor(week),
  };
}

const NUTRITION_TIPS = [
  "Comece o dia com um copo de água antes do café da manhã.",
  "Inclua uma fonte de proteína em cada refeição principal.",
  "Troque um refrigerante do dia por água ou chá gelado sem açúcar.",
  "Mastigue devagar e preste atenção ao sinal de saciedade.",
  "Adicione uma porção de vegetais no almoço e no jantar.",
  "Prepare uma refeição em casa em vez de pedir delivery.",
  "Descanse bem hoje — o sono também faz parte do processo.",
  "Leve um lanche saudável para não chegar faminto nas refeições.",
  "Reduza o açúcar do café ou substitua por uma opção natural.",
  "Experimente trocar o pão branco por uma versão integral.",
  "Beba água ao longo do dia, não só quando sentir sede.",
  "Escolha frutas como sobremesa hoje.",
  "Evite fazer outras coisas enquanto come — foque na refeição.",
  "Dia de descanso: aproveite para planejar as refeições da semana.",
  "Aumente um pouco a porção de vegetais no prato principal.",
  "Prefira alimentos assados ou grelhados a fritos hoje.",
  "Tente esperar 10 minutos antes de repetir o prato.",
  "Reduza um item ultraprocessado da sua lista de hoje.",
  "Organize o café da manhã de amanhã com antecedência.",
  "Note como está se sentindo comparado ao dia 1 — celebre o progresso.",
  "Dia de descanso: reflita sobre o hábito que mais evoluiu nesses 21 dias.",
];

const PROFILE_KEY = "leveza21-profile";
const CHECKINS_KEY = "leveza21-checkins";

// Simple localStorage-backed replacement for window.storage (Claude-only API).
// Kept async so the rest of the component code didn't need to change.
const storage = {
  async get(key) {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return { key, value: raw };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return { key, deleted: true };
  },
};

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function dayNumberFor(startDate, dateISO) {
  const start = new Date(startDate + "T00:00:00");
  const target = new Date(dateISO + "T00:00:00");
  const diff = Math.round((target - start) / 86400000);
  return diff + 1;
}

function isCompleted(entry) {
  if (!entry) return false;
  return Boolean(entry.treino || entry.alimentacao || (entry.energia && entry.energia > 0));
}

export default function Leveza21() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [checkins, setCheckins] = useState({});
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [saved, setSaved] = useState(false);

  const [formName, setFormName] = useState("");
  const [formWeight, setFormWeight] = useState("");
  const [formGoal, setFormGoal] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const p = await storage.get(PROFILE_KEY);
        if (p && p.value) setProfile(JSON.parse(p.value));
      } catch (e) {
        // key not found yet — normal for a new user
      }
      try {
        const c = await storage.get(CHECKINS_KEY);
        if (c && c.value) setCheckins(JSON.parse(c.value));
      } catch (e) {
        // key not found yet — normal for a new user
      }
      setLoading(false);
    })();
  }, []);

  const today = todayISO();
  const dayNumber = profile ? dayNumberFor(profile.startDate, today) : null;
  const todayEntry = checkins[today] || { treino: false, alimentacao: false, agua: 0, energia: 0, peso: "" };

  const [draft, setDraft] = useState(todayEntry);
  useEffect(() => {
    setDraft(checkins[today] || { treino: false, alimentacao: false, agua: 0, energia: 0, peso: "" });
  }, [profile, loading]);

  async function startProgram() {
    if (!formName.trim()) return;
    const newProfile = {
      name: formName.trim(),
      startDate: today,
      startWeight: formWeight ? parseFloat(formWeight) : null,
      goalWeight: formGoal ? parseFloat(formGoal) : null,
    };
    // Advance immediately so the UI never feels stuck; storage is best-effort.
    setProfile(newProfile);
    try {
      await storage.set(PROFILE_KEY, JSON.stringify(newProfile));
    } catch (e) {
      console.error("Falha ao salvar perfil:", e);
    }
  }

  async function saveCheckin() {
    const updated = { ...checkins, [today]: draft };
    setCheckins(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);

    // Update the persisted streak (independent of check-in history so it survives cycle resets).
    let nextStreak = profile.streak || 0;
    if (profile.lastCheckinDate === today) {
      // already counted today
    } else if (profile.lastCheckinDate === todayISO(-1)) {
      nextStreak = nextStreak + 1;
    } else {
      nextStreak = 1;
    }
    const updatedProfile = { ...profile, streak: nextStreak, lastCheckinDate: today };
    setProfile(updatedProfile);

    try {
      await storage.set(CHECKINS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Falha ao salvar check-in:", e);
    }
    try {
      await storage.set(PROFILE_KEY, JSON.stringify(updatedProfile));
    } catch (e) {
      console.error("Falha ao salvar perfil:", e);
    }
  }

  async function resetProgram() {
    setProfile(null);
    setCheckins({});
    setConfirmingReset(false);
    setFormName("");
    setFormWeight("");
    setFormGoal("");
    try {
      await storage.delete(PROFILE_KEY);
    } catch (e) {}
    try {
      await storage.delete(CHECKINS_KEY);
    } catch (e) {}
  }

  async function startNewCycle() {
    const updatedProfile = {
      ...profile,
      startDate: todayISO(),
      cyclesCompleted: (profile.cyclesCompleted || 0) + 1,
      startWeight: weightData.length ? weightData[weightData.length - 1].peso : profile.startWeight,
    };
    setProfile(updatedProfile);
    setCheckins({});
    try {
      await storage.set(PROFILE_KEY, JSON.stringify(updatedProfile));
    } catch (e) {
      console.error("Falha ao salvar perfil:", e);
    }
    try {
      await storage.set(CHECKINS_KEY, JSON.stringify({}));
    } catch (e) {
      console.error("Falha ao limpar check-ins:", e);
    }
  }

  const streak = profile ? profile.streak || 0 : 0;

  const daysDone = profile
    ? Array.from({ length: PROGRAM_LENGTH }, (_, i) => i + 1).filter((n) => {
        const d = todayISO(n - dayNumber);
        return isCompleted(checkins[d]);
      }).length
    : 0;

  const weightData = profile
    ? Object.entries(checkins)
        .filter(([, v]) => v && v.peso)
        .map(([date, v]) => ({
          day: dayNumberFor(profile.startDate, date),
          peso: parseFloat(v.peso),
        }))
        .sort((a, b) => a.day - b.day)
    : [];

  if (loading) {
    return (
      <div style={{ background: theme.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.body, color: theme.textMuted }}>
        carregando…
      </div>
    );
  }

  // ONBOARDING
  if (!profile) {
    return (
      <div style={{ background: theme.bg, minHeight: "100vh", fontFamily: font.body, color: theme.text, display: "flex", justifyContent: "center", padding: "32px 20px" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600;700&display=swap');`}</style>
        <div style={{ maxWidth: 380, width: "100%" }}>
          <p style={{ color: theme.amber, fontWeight: 600, fontSize: 13, letterSpacing: 0.3, margin: "0 0 6px" }}>Método Leveza 21</p>
          <h1 style={{ fontFamily: font.display, fontSize: 32, fontWeight: 600, lineHeight: 1.15, margin: "0 0 8px" }}>Reset Metabólico</h1>
          <p style={{ color: theme.textMuted, fontSize: 15, lineHeight: 1.5, margin: "0 0 20px" }}>
            21 dias de treino em casa (sem equipamentos), orientações alimentares diárias e um check-in para acompanhar sua consistência.
          </p>

          <label style={labelStyle}>Como podemos te chamar?</label>
          <input style={inputStyle} value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Seu nome" />

          <label style={labelStyle}>Peso inicial (kg) — opcional</label>
          <input style={inputStyle} type="number" value={formWeight} onChange={(e) => setFormWeight(e.target.value)} placeholder="Ex: 78" />

          <label style={labelStyle}>Meta de peso (kg) — opcional</label>
          <input style={inputStyle} type="number" value={formGoal} onChange={(e) => setFormGoal(e.target.value)} placeholder="Ex: 72" />

          <button
            onClick={startProgram}
            disabled={!formName.trim()}
            style={{
              width: "100%",
              marginTop: 10,
              padding: "14px",
              borderRadius: 10,
              border: "none",
              background: formName.trim() ? theme.amber : theme.surfaceMuted,
              color: formName.trim() ? "#fff" : theme.textMuted,
              fontFamily: font.body,
              fontWeight: 600,
              fontSize: 15,
              cursor: formName.trim() ? "pointer" : "default",
            }}
          >
            Começar o dia 1
          </button>
          <p style={{ fontSize: 11.5, color: theme.textMuted, lineHeight: 1.5, marginTop: 16 }}>
            Programa educativo de exercícios de baixo impacto e hábitos alimentares. Não substitui orientação médica ou nutricional individual — consulte um profissional de saúde antes de iniciar, especialmente se tiver alguma condição pré-existente.
          </p>
        </div>
      </div>
    );
  }

  const finished = dayNumber > PROGRAM_LENGTH;

  // COMPLETION SCREEN — shown once the 21 days are done
  if (finished) {
    const cycleNumber = (profile.cyclesCompleted || 0) + 1;
    const startW = profile.startWeight;
    const lastW = weightData.length ? weightData[weightData.length - 1].peso : null;
    const delta = startW && lastW ? (lastW - startW).toFixed(1) : null;

    return (
      <div style={{ background: theme.bg, minHeight: "100vh", fontFamily: font.body, color: theme.text, display: "flex", justifyContent: "center", padding: "32px 18px 60px" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600;700&display=swap');`}</style>
        <div style={{ maxWidth: 420, width: "100%" }}>
          <p style={{ color: theme.amber, fontWeight: 600, fontSize: 13, margin: "0 0 6px" }}>Ciclo {cycleNumber} concluído</p>
          <h1 style={{ fontFamily: font.display, fontSize: 34, fontWeight: 600, lineHeight: 1.15, margin: "0 0 8px" }}>
            21 dias, {profile.name}.
          </h1>
          <p style={{ color: theme.textMuted, fontSize: 15, lineHeight: 1.5, margin: "0 0 24px" }}>
            Você chegou até aqui. Isso já coloca você à frente de quem só pensa em começar.
          </p>

          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <StatCard icon={<Check size={18} color={theme.sage} />} label="Dias completos" value={`${daysDone}/${PROGRAM_LENGTH}`} />
            <StatCard icon={<Flame size={18} color={theme.amber} />} label="Sequência" value={`${streak} dia${streak === 1 ? "" : "s"}`} />
          </div>

          {delta !== null && (
            <div style={{ background: theme.surface, borderRadius: 14, padding: 18, marginBottom: 20, border: `1px solid ${theme.border}` }}>
              <p style={sectionLabel}>Peso no ciclo</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 13, color: theme.textMuted }}>{startW} kg → {lastW} kg</span>
                <span style={{ fontFamily: font.display, fontSize: 20, fontWeight: 600, color: delta <= 0 ? theme.sage : theme.text }}>
                  {delta > 0 ? "+" : ""}{delta} kg
                </span>
              </div>
            </div>
          )}

          <p style={sectionLabel}>Sua trilha</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 26 }}>
            {Array.from({ length: PROGRAM_LENGTH }, (_, i) => i + 1).map((n) => {
              const d = todayISO(n - dayNumber);
              const completed = isCompleted(checkins[d]);
              return (
                <div
                  key={n}
                  style={{
                    aspectRatio: "1",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    background: completed ? theme.sage : theme.surfaceMuted,
                    color: completed ? "#fff" : theme.textMuted,
                  }}
                >
                  {n}
                </div>
              );
            })}
          </div>

          <button
            onClick={startNewCycle}
            style={{
              width: "100%",
              padding: 14,
              borderRadius: 10,
              border: "none",
              background: theme.amber,
              color: "#fff",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
              marginBottom: 10,
            }}
          >
            Começar novo ciclo
          </button>
          <p style={{ fontSize: 12, color: theme.textMuted, textAlign: "center", margin: 0 }}>
            Seu check-in diário zera, mas sua sequência de {streak} dia{streak === 1 ? "" : "s"} continua.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: theme.bg, minHeight: "100vh", fontFamily: font.body, color: theme.text, display: "flex", justifyContent: "center", padding: "28px 18px 60px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div style={{ maxWidth: 420, width: "100%" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
          <p style={{ color: theme.amber, fontWeight: 600, fontSize: 13, margin: 0 }}>Olá, {profile.name}</p>
          <button onClick={() => setConfirmingReset(true)} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer", padding: 4 }} aria-label="Recomeçar programa">
            <RotateCcw size={16} />
          </button>
        </div>
        <h1 style={{ fontFamily: font.display, fontSize: 40, fontWeight: 600, margin: "0 0 4px" }}>
          Dia {dayNumber}
          <span style={{ fontSize: 20, color: theme.textMuted }}> de {PROGRAM_LENGTH}</span>
        </h1>
        <p style={{ color: theme.textMuted, fontSize: 14, margin: "0 0 22px" }}>
          Reset Metabólico{profile.cyclesCompleted ? ` — Ciclo ${profile.cyclesCompleted + 1}` : ""}
        </p>

        {confirmingReset && (
          <div style={{ background: theme.surface, border: `1px solid ${theme.brick}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <p style={{ margin: "0 0 12px", fontSize: 14 }}>Isso apaga todo o seu progresso e recomeça do dia 1. Tem certeza?</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={resetProgram} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: theme.brick, color: "#fff", fontWeight: 600, cursor: "pointer" }}>Recomeçar</button>
              <button onClick={() => setConfirmingReset(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${theme.border}`, background: "transparent", color: theme.text, cursor: "pointer" }}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Today's plan */}
        {!finished && (
          <div style={{ background: theme.surface, borderRadius: 14, padding: 18, marginBottom: 20, border: `1px solid ${theme.border}` }}>
            <p style={sectionLabel}>Plano de hoje</p>
            {(() => {
              const plan = planFor(Math.min(dayNumber, PROGRAM_LENGTH));
              const tip = NUTRITION_TIPS[Math.min(dayNumber, PROGRAM_LENGTH) - 1];
              return (
                <>
                  {plan.isRest ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                      <Dumbbell size={18} color={theme.sage} />
                      <span style={{ fontSize: 14, fontWeight: 600 }}>Dia de descanso — sem treino</span>
                    </div>
                  ) : (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <Dumbbell size={18} color={theme.amber} />
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{plan.treinoNome}</span>
                      </div>
                      <p style={{ fontSize: 12, color: theme.textMuted, margin: "0 0 10px" }}>{plan.rounds}</p>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
                        {plan.treino.map((ex) => (
                          <li key={ex.nome}>
                            {ex.nome}
                            {ex.detalhe ? <span style={{ color: theme.textMuted }}> — {ex.detalhe}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
                    <Salad size={18} color={theme.sage} style={{ flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>{tip}</p>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
          <StatCard icon={<Flame size={18} color={theme.amber} />} label="Sequência" value={`${streak} dia${streak === 1 ? "" : "s"}`} />
          <StatCard icon={<Check size={18} color={theme.sage} />} label="Dias completos" value={`${daysDone}/${PROGRAM_LENGTH}`} />
        </div>

        {/* 21-day path */}
        <p style={sectionLabel}>Sua trilha</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 26 }}>
          {Array.from({ length: PROGRAM_LENGTH }, (_, i) => i + 1).map((n) => {
            const d = todayISO(n - dayNumber);
            const completed = isCompleted(checkins[d]);
            const isToday = n === dayNumber;
            const isPastMissed = n < dayNumber && !completed;
            return (
              <div
                key={n}
                style={{
                  aspectRatio: "1",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  background: completed ? theme.sage : isToday ? theme.surface : theme.surfaceMuted,
                  color: completed ? "#fff" : isToday ? theme.text : theme.textMuted,
                  border: isToday ? `2px solid ${theme.amber}` : isPastMissed ? `1px dashed ${theme.border}` : "1px solid transparent",
                }}
              >
                {n}
              </div>
            );
          })}
        </div>

        {/* Check-in form */}
        {!finished && (
          <>
            <p style={sectionLabel}>Check-in de hoje</p>
            <div style={{ background: theme.surface, borderRadius: 14, padding: 18, marginBottom: 20, border: `1px solid ${theme.border}` }}>
              <ToggleRow icon={<Dumbbell size={18} />} label="Treino feito" active={draft.treino} onClick={() => setDraft({ ...draft, treino: !draft.treino })} />
              <ToggleRow icon={<Salad size={18} />} label="Plano alimentar seguido" active={draft.alimentacao} onClick={() => setDraft({ ...draft, alimentacao: !draft.alimentacao })} />

              <div style={{ padding: "12px 0", borderTop: `1px solid ${theme.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Droplet size={18} color={theme.textMuted} />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Copos de água</span>
                  <span style={{ marginLeft: "auto", fontWeight: 600 }}>{draft.agua}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      onClick={() => setDraft({ ...draft, agua: n === draft.agua ? n - 1 : n })}
                      style={{
                        flex: 1,
                        height: 26,
                        borderRadius: 5,
                        border: "none",
                        background: n <= draft.agua ? theme.sage : theme.surfaceMuted,
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ padding: "12px 0", borderTop: `1px solid ${theme.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Zap size={18} color={theme.textMuted} />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Nível de energia</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setDraft({ ...draft, energia: n })}
                      style={{
                        flex: 1,
                        padding: "8px 0",
                        borderRadius: 7,
                        border: "none",
                        background: draft.energia === n ? theme.amber : theme.surfaceMuted,
                        color: draft.energia === n ? "#fff" : theme.textMuted,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ padding: "12px 0 0", borderTop: `1px solid ${theme.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <Scale size={18} color={theme.textMuted} />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Peso de hoje (kg) — opcional</span>
                </div>
                <input
                  style={{ ...inputStyle, marginBottom: 0 }}
                  type="number"
                  value={draft.peso}
                  onChange={(e) => setDraft({ ...draft, peso: e.target.value })}
                  placeholder="Ex: 76.5"
                />
              </div>
            </div>

            <button
              onClick={saveCheckin}
              style={{
                width: "100%",
                padding: 14,
                borderRadius: 10,
                border: "none",
                background: saved ? theme.sage : theme.amber,
                color: "#fff",
                fontWeight: 600,
                fontSize: 15,
                cursor: "pointer",
                marginBottom: 28,
              }}
            >
              {saved ? "Check-in salvo" : "Salvar check-in de hoje"}
            </button>
          </>
        )}

        {/* Weight chart */}
        {weightData.length > 1 && (
          <>
            <p style={sectionLabel}>Evolução do peso</p>
            <div style={{ background: theme.surface, borderRadius: 14, padding: "14px 8px", border: `1px solid ${theme.border}` }}>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={weightData}>
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: theme.textMuted }} tickLine={false} axisLine={{ stroke: theme.border }} />
                  <YAxis tick={{ fontSize: 11, fill: theme.textMuted }} tickLine={false} axisLine={false} domain={["auto", "auto"]} width={36} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${theme.border}` }} />
                  <Line type="monotone" dataKey="peso" stroke={theme.amber} strokeWidth={2.5} dot={{ r: 3, fill: theme.amber }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div style={{ flex: 1, background: theme.surface, borderRadius: 12, padding: "14px 16px", border: `1px solid ${theme.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 12, color: theme.textMuted }}>{label}</span>
      </div>
      <span style={{ fontFamily: font.display, fontSize: 22, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function ToggleRow({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 0",
        background: "none",
        border: "none",
        borderBottom: `1px solid ${theme.border}`,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span style={{ color: active ? theme.sage : theme.textMuted }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{label}</span>
      <span
        style={{
          marginLeft: "auto",
          width: 22,
          height: 22,
          borderRadius: 6,
          background: active ? theme.sage : theme.surfaceMuted,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {active && <Check size={14} color="#fff" />}
      </span>
    </button>
  );
}

const labelStyle = { display: "block", fontSize: 12, color: theme.textMuted, marginBottom: 6, marginTop: 16 };
const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 9,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  fontSize: 15,
  fontFamily: font.body,
  color: theme.text,
  boxSizing: "border-box",
  marginBottom: 4,
};
const sectionLabel = { fontSize: 13, fontWeight: 600, color: theme.textMuted, margin: "0 0 10px" };
