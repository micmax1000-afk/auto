import { useTranslation } from "react-i18next";
import type { Vehicle, Reminder, MaintenanceEntry, FuelEntry, ChargingEntry, ExpenseEntry } from "../types";
import { isReminderDue, calculateConsumption, averageConsumption } from "../utils/calculations";
import { getNumberLocale } from "../utils/locale";
import { formatDistance, kmToDisplayDistance, type DistanceUnit } from "../utils/settings";
import { useAppSettings } from "../contexts/AppSettingsContext";
import { FREE_VEHICLE_LIMIT } from "../services/billing/useProStatus";
import VehicleDashboardCluster from "./VehicleDashboardCluster";
import VehicleBodyIcon from "./VehicleBodyIcon";
import VehicleGaugeCluster from "./VehicleGaugeCluster";
import TopAppBar from "./TopAppBar";
import UpcomingReminders from "./UpcomingReminders";

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
  onOpenMenu: () => void;
  onOpenReminder: (vehicleId: string) => void;
  onOpenReminders: () => void;
  onOpenMaintenance: () => void;
  onOpenStats: () => void;
  onOpenDocuments: () => void;
  onOpenPremium: () => void;
  onOpenKmHistory: () => void;
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

function urgentTotal(vehicles: Vehicle[], reminders: Reminder[]) {
  const ids = new Set(vehicles.map(v => v.id));
  const reminderCount = reminders.filter(r => ids.has(r.vehicleId) && !r.completed).filter(r => {
    const v = vehicles.find(x => x.id === r.vehicleId);
    return v ? isReminderDue(r.dueDate, r.dueKm, v.currentKm) !== "ok" : false;
  }).length;
  return reminderCount;
}

export default function Dashboard({
  vehicles,
  reminders,
  maintenanceEntries,
  fuelEntries,
  isPro,
  onOpenVehicle,
  onAddVehicle,
  onManageVehicles,
  onQuickFuel,
  onQuickKm,
  onOpenMenu,
  onOpenReminder,
  onOpenReminders,
  onOpenMaintenance,
  onOpenStats,
  onOpenDocuments,
  onOpenPremium,
  onOpenKmHistory,
}: Props) {
  const { t, i18n } = useTranslation();
  const { distanceUnit } = useAppSettings();
  const locale = getNumberLocale(i18n.language);
  const activeVehicles = vehicles.filter((v) => !v.archived);
  const primaryVehicle = activeVehicles[0];
  const urgentCount = urgentTotal(activeVehicles, reminders);

  const primaryConsumption = primaryVehicle
    ? averageConsumption(calculateConsumption(fuelEntries.filter((f) => f.vehicleId === primaryVehicle.id)))
    : null;

  return (
    <div className="dashboard">
      <TopAppBar
        title={t("appName", "Diario Auto")}
        urgentCount={urgentCount}
        onOpenMenu={onOpenMenu}
        onOpenNotifications={onOpenReminders}
      />

      {!isPro && (
        <button type="button" className="dash-pro-banner" onClick={onOpenPremium}>
          <span>⭐ {t("premium.topbarCta", "Passa a Pro")}</span>
          <span className="dash-pro-banner__chevron">›</span>
        </button>
      )}

      {primaryVehicle && (
        <section className="dash-featured-vehicle" onClick={() => onOpenVehicle(primaryVehicle.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpenVehicle(primaryVehicle.id)}>
          <div className="dash-featured-vehicle__photo">
            <span className="dash-featured-vehicle__badge">{t("dashboardGarage.primary", "PRINCIPALE")}</span>
            <VehicleBodyIcon bodyType={primaryVehicle.bodyType ?? "hatchback"} />
          </div>
          <div className="dash-featured-vehicle__info">
            <div>
              <h1 className="dash-featured-vehicle__name">{primaryVehicle.name}</h1>
              <p className="dash-featured-vehicle__km">
                {formatDistance(primaryVehicle.currentKm, distanceUnit, locale)}
                <button
                  type="button"
                  className="dash-featured-vehicle__edit"
                  onClick={(e) => { e.stopPropagation(); onQuickKm(primaryVehicle); }}
                  aria-label={t("dashboardGarage.updateKm", "Aggiorna km")}
                >
                  ✎
                </button>
              </p>
            </div>
            <span className="dash-featured-vehicle__chevron">›</span>
          </div>
        </section>
      )}

      {primaryVehicle && (
        <section className="dash-gauge-card">
          <div className="dash-gauge-card__head">
            <h2>{t("dashboardGarage.cluster", "Cruscotto")}</h2>
            <button type="button" className="dash-icon-btn" onClick={onOpenKmHistory} aria-label={t("kmHistory.title", "Cronologia km")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 20 10 12 14 15 20 6" />
                <path d="M14 6h6v6" />
              </svg>
            </button>
          </div>
          <VehicleGaugeCluster
            totalKmLabel={formatDistance(primaryVehicle.currentKm, distanceUnit, locale)}
            totalKmSubtitle={t("dashboardGarage.totalKm", `${distanceUnit} totali`)}
            avgConsumption={primaryConsumption}
            avgConsumptionUnit={t("dashboardGarage.avgConsumptionUnit", "l/100km")}
          />
          <VehicleDashboardCluster
            reminders={reminders.filter((r) => r.vehicleId === primaryVehicle.id)}
            currentKm={primaryVehicle.currentKm}
          />
        </section>
      )}

      {activeVehicles.length > 0 && (
        <UpcomingReminders
          vehicles={activeVehicles}
          reminders={reminders}
          distanceUnit={distanceUnit}
          onOpenReminder={() => onOpenReminder(primaryVehicle?.id ?? activeVehicles[0].id)}
          onViewAll={onOpenReminders}
        />
      )}

      {activeVehicles.length > 0 && (
        <section className="dash-action-grid">
          <button type="button" className="dash-action-grid__item dash-action-grid__item--highlight" onClick={onQuickFuel}>
            <span className="dash-action-grid__icon">⛽</span>
            <strong>{t("dashboardGarage.quickAction", "AZIONE RAPIDA")}</strong>
            <span>{t("dashboardGarage.fuel", "Rifornimento")}</span>
          </button>
          <button type="button" className="dash-action-grid__item" onClick={onOpenMaintenance}>
            <span className="dash-action-grid__icon">🔧</span>
            <span>{t("bottomNav.maintenance", "Manutenzione")}</span>
          </button>
          <button type="button" className="dash-action-grid__item" onClick={onOpenStats}>
            <span className="dash-action-grid__icon">📊</span>
            <span>{t("bottomNav.stats", "Statistiche")}</span>
          </button>
          <button type="button" className="dash-action-grid__item" onClick={onOpenReminders}>
            <span className="dash-action-grid__icon">📅</span>
            <span>{t("dashboardGarage.deadlines", "Scadenze")}</span>
          </button>
          <button type="button" className="dash-action-grid__item" onClick={onOpenDocuments}>
            <span className="dash-action-grid__icon">📁</span>
            <span>{t("dashboardGarage.documents", "Documenti")}</span>
          </button>
          <button type="button" className="dash-action-grid__item" onClick={onOpenReminders}>
            <span className="dash-action-grid__icon">🔔</span>
            <span>{t("dashboardGarage.reminders", "Promemoria")}</span>
          </button>
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
            {activeVehicles
              .filter((v) => v.id !== primaryVehicle?.id)
              .map((v) => {
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
