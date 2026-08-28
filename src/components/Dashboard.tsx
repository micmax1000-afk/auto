import { useTranslation } from "react-i18next";
import type { Vehicle, Reminder, MaintenanceEntry, FuelEntry, ChargingEntry, ExpenseEntry } from "../types";
import { isReminderDue } from "../utils/calculations";
import { getNumberLocale } from "../utils/locale";
import { formatDistance, kmToDisplayDistance, type DistanceUnit } from "../utils/settings";
import { useAppSettings } from "../contexts/AppSettingsContext";
import { FREE_VEHICLE_LIMIT } from "../services/billing/useProStatus";
import VehicleDashboardCluster from "./VehicleDashboardCluster";

interface Props {
  vehicles: Vehicle[];
  reminders: Reminder[];
  maintenanceEntries: MaintenanceEntry[];
  fuelEntries: FuelEntry[];
  chargingEntries: ChargingEntry[];
  expenseEntries: ExpenseEntry[];
  isPro: boolean;
  onOpenVehicle: (id: string) => void;
  onAddVehicle: () => void;
  onManageVehicles: () => void;
  onQuickFuel: () => void;
  onQuickCharge: () => void;
  onQuickKm: (vehicle: Vehicle) => void;
}

function getNextReminder(
  vehicleId: string,
  currentKm: number,
  reminders: Reminder[],
  locale: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
  distanceUnit: DistanceUnit,
) {
  const active = reminders
    .filter((r) => r.vehicleId === vehicleId && !r.completed)
    .map((r) => {
      const status = isReminderDue(r.dueDate, r.dueKm, currentKm);
      let text = r.label;
      if (r.type === "km" && r.dueKm != null) {
        const remaining = r.dueKm - currentKm;
        const remainingDisplay = kmToDisplayDistance(remaining, distanceUnit).toLocaleString(locale, { maximumFractionDigits: 0 });
        text =
          remaining > 0
            ? t("dashboardGarage.reminderInKm", { label: r.label, km: `${remainingDisplay} ${distanceUnit}` })
            : t("dashboardGarage.reminderOverdue", { label: r.label });
      } else if (r.type === "data" && r.dueDate) {
        const d = new Date(r.dueDate);
        text = `${r.label} ${d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })}`;
      }
      return { text, status };
    })
    .filter((r) => r.status !== "ok")
    .sort((a, b) => {
      if (a.status === "overdue" && b.status !== "overdue") return -1;
      if (b.status === "overdue" && a.status !== "overdue") return 1;
      return 0;
    });

  return active[0] ?? null;
}

function getMaintenanceStatus(
  vehicleId: string,
  maintenanceEntries: MaintenanceEntry[],
  t: (key: string) => string,
) {
  const recent = maintenanceEntries.filter((m) => m.vehicleId === vehicleId);
  if (recent.length === 0) return { label: t("dashboardGarage.maintenanceToPlan"), ok: false };
  return { label: t("dashboardGarage.maintenanceOk"), ok: true };
}

function formatEuro(value: number) {
  return value.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function monthlyCost(fuel: FuelEntry[], charging: ChargingEntry[], maintenance: MaintenanceEntry[], expenses: ExpenseEntry[]) {
  const now = new Date();
  const sameMonth = (date: string) => { const d = new Date(date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); };
  return [...fuel, ...charging, ...maintenance, ...expenses].reduce((sum, e) => {
    const cost = "totalCost" in e ? e.totalCost : "cost" in e ? e.cost : e.amount;
    return sameMonth(e.date) ? sum + (Number(cost) || 0) : sum;
  }, 0);
}

function urgentTotal(vehicles: Vehicle[], reminders: Reminder[], maintenance: MaintenanceEntry[]) {
  const ids = new Set(vehicles.map(v => v.id));
  const reminderCount = reminders.filter(r => ids.has(r.vehicleId) && !r.completed).filter(r => {
    const v = vehicles.find(x => x.id === r.vehicleId);
    return v ? isReminderDue(r.dueDate, r.dueKm, v.currentKm) !== "ok" : false;
  }).length;
  return reminderCount;
}

function OverviewCard({ icon, label, value, tone }: { icon: string; label: string; value: string; tone?: "warn" | "ok" }) {
  return <article className={`dash-overview-card ${tone ? `dash-overview-card--${tone}` : ""}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>;
}

export default function Dashboard({
  vehicles,
  reminders,
  maintenanceEntries,
  fuelEntries,
  chargingEntries,
  expenseEntries,
  isPro,
  onOpenVehicle,
  onAddVehicle,
  onManageVehicles,
  onQuickFuel,
  onQuickCharge,
  onQuickKm,
}: Props) {
  const { t, i18n } = useTranslation();
  const { distanceUnit } = useAppSettings();
  const locale = getNumberLocale(i18n.language);
  const activeVehicles = vehicles.filter((v) => !v.archived);

  return (
    <div className="dashboard">
      {/* HERO / TODAY */}
      <section className="dash-hero dash-hero--compact">
        <div className="dash-hero__content">
          <p className="dash-hero__label">{t("dashboardGarage.heroLabel")}</p>
          <h1 className="dash-hero__title">{t("dashboardGarage.heroTitleLine1")}<br />{t("dashboardGarage.heroTitleLine2")}</h1>
          <p className="dash-hero__subtitle">{t("dashboardGarage.heroSubtitle")}</p>
        </div>
        <div className="dash-hero__today">
          <span>⚡</span>
          <strong>{urgentTotal(activeVehicles, reminders, maintenanceEntries)}</strong>
          <small>{t("dashboardGarage.actionsNeeded", "attenzioni da controllare")}</small>
        </div>
      </section>

      {activeVehicles.length > 0 && (
        <section className="dash-quick-actions" aria-label={t("dashboardGarage.quickActions", "Azioni rapide")}>
          <button type="button" onClick={onQuickFuel}><span>⛽</span><strong>{t("quickEntry.fuelTitle")}</strong></button>
          <button type="button" onClick={onQuickCharge}><span>⚡</span><strong>{t("quickEntry.chargeTitle")}</strong></button>
          <button type="button" onClick={() => onQuickKm(activeVehicles[0])}><span>📍</span><strong>{t("dashboardGarage.updateKm", "Aggiorna km")}</strong></button>
        </section>
      )}

      {activeVehicles.length > 0 && (
        <section className="dash-overview-grid">
          <OverviewCard icon="💶" label={t("dashboardGarage.monthCost", "Spese questo mese")} value={formatEuro(monthlyCost(fuelEntries, chargingEntries, maintenanceEntries, expenseEntries))} />
          <OverviewCard icon="🔧" label={t("dashboardGarage.openItems", "Interventi registrati")} value={String(maintenanceEntries.filter(m => activeVehicles.some(v => v.id === m.vehicleId)).length)} />
          <OverviewCard icon="🔔" label={t("dashboardGarage.urgent", "Scadenze")} value={String(urgentTotal(activeVehicles, reminders, maintenanceEntries))} tone={urgentTotal(activeVehicles, reminders, maintenanceEntries) > 0 ? "warn" : "ok"} />
        </section>
      )}

      {/* VEICOLI */}
      <section className="dash-vehicles">
        <div className="dash-vehicles__head">
          <h2>
            {t("dashboardGarage.yourVehicles")}
            {!isPro && (
              <span className="dash-vehicles__count">
                {" "}
                ({activeVehicles.length}/{FREE_VEHICLE_LIMIT})
              </span>
            )}
          </h2>
          <div style={{ display: "flex", gap: "0.9rem" }}>
            <button type="button" className="dash-link" onClick={onManageVehicles}>
              {t("dashboardGarage.manage")}
            </button>
            {activeVehicles.length > 0 && (
              <button type="button" className="dash-link" onClick={onAddVehicle}>
                + {t("dashboardGarage.add")}
              </button>
            )}
          </div>
        </div>

        {activeVehicles.length === 0 ? (
          <div className="dash-empty">
            <p>{t("dashboardGarage.emptyTitle")}</p>
            <button type="button" className="btn btn--primary" onClick={onAddVehicle}>
              + {t("dashboardGarage.emptyAddFirst")}
            </button>
          </div>
        ) : (
          <div className="dash-vehicle-list">
            {activeVehicles.map((v) => {
              const nextRem = getNextReminder(v.id, v.currentKm, reminders, locale, t, distanceUnit);
              const maint = getMaintenanceStatus(v.id, maintenanceEntries, t);

              return (
                <article
                  key={v.id}
                  className="dash-card"
                  onClick={() => onOpenVehicle(v.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onOpenVehicle(v.id)}
                >
                  <div className="dash-card__photo">
                    <VehicleDashboardCluster
                      reminders={reminders.filter((r) => r.vehicleId === v.id)}
                      currentKm={v.currentKm}
                    />
                  </div>

                  <div className="dash-card__body">
                    <div className="dash-card__top">
                      <div>
                        <h3 className="dash-card__name">{v.name}</h3>
                        <p className="dash-card__meta">
                          {v.year ? `${v.year} · ` : ""}
                          {t(`fuelType.${v.fuelType}`)}
                          {v.plate ? ` · ${v.plate}` : ""}
                        </p>
                      </div>
                      <div className="dash-card__km">{formatDistance(v.currentKm, distanceUnit, locale)}</div>
                    </div>

                    <div className="dash-card__stats">
                      <span className={`dash-stat ${maint.ok ? "dash-stat--ok" : "dash-stat--warn"}`}>
                        {maint.ok ? "✓ " : "⚠ "}
                        {t("dashboardGarage.maintenanceLabel")} {maint.label}
                      </span>
                    </div>

                    {nextRem && (
                      <div className={`dash-card__reminder ${nextRem.status === "overdue" ? "is-overdue" : ""}`}>
                        📅 {nextRem.text}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
