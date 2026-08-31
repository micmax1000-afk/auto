import { useTranslation } from "react-i18next";
import type { Vehicle, Reminder, MaintenanceEntry, FuelEntry, ChargingEntry, ExpenseEntry } from "../types";
import { getNumberLocale } from "../utils/locale";
import { formatDistance } from "../utils/settings";
import { useAppSettings } from "../contexts/AppSettingsContext";
import { FREE_VEHICLE_LIMIT } from "../services/billing/useProStatus";
import UpcomingReminders from "./UpcomingReminders";
import ActionGridIcon from "./ActionGridIcon";

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
  onOpenReminder: (vehicleId: string) => void;
  onOpenReminders: () => void;
  onOpenMaintenance: () => void;
  onOpenStats: () => void;
  onOpenUtilities: () => void;
  onOpenPremium: () => void;
}

export default function Dashboard({
  vehicles,
  reminders,
  isPro,
  onOpenVehicle,
  onAddVehicle,
  onManageVehicles,
  onQuickFuel,
  onQuickKm,
  onOpenReminder,
  onOpenReminders,
  onOpenMaintenance,
  onOpenStats,
  onOpenUtilities,
}: Props) {
  const { t, i18n } = useTranslation();
  const { distanceUnit } = useAppSettings();
  const locale = getNumberLocale(i18n.language);
  const activeVehicles = vehicles.filter((v) => !v.archived);
  const primaryVehicle = activeVehicles[0];

  return (
    <div className="dashboard">
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
            <ActionGridIcon name="fuel" className="dash-action-grid__icon dash-action-grid__icon--green" />
            <strong>{t("dashboardGarage.quickAction", "AZIONE RAPIDA")}</strong>
            <span>{t("dashboardGarage.fuel", "Rifornimento")}</span>
          </button>
          <button type="button" className="dash-action-grid__item" onClick={onOpenMaintenance}>
            <ActionGridIcon name="wrench" className="dash-action-grid__icon dash-action-grid__icon--orange" />
            <span>{t("bottomNav.maintenance", "Manutenzione")}</span>
          </button>
          <button type="button" className="dash-action-grid__item" onClick={onOpenStats}>
            <ActionGridIcon name="chart" className="dash-action-grid__icon dash-action-grid__icon--blue" />
            <span>{t("bottomNav.stats", "Statistiche")}</span>
          </button>
          <button type="button" className="dash-action-grid__item" onClick={onOpenUtilities}>
            <ActionGridIcon name="folder" className="dash-action-grid__icon dash-action-grid__icon--yellow" />
            <span>{t("utilities.title", "Utilità")}</span>
          </button>
          <button type="button" className="dash-action-grid__item" onClick={onOpenReminders}>
            <ActionGridIcon name="bell" className="dash-action-grid__icon dash-action-grid__icon--red" />
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
          <div className="dash-vehicle-list dash-vehicle-list--featured">
            {activeVehicles.map((v, index) => (
              <section
                key={v.id}
                className="dash-featured-vehicle"
                onClick={() => onOpenVehicle(v.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onOpenVehicle(v.id)}
              >
                <div className="dash-featured-vehicle__photo">
                  {index === 0 && <span className="dash-featured-vehicle__badge">{t("dashboardGarage.primary", "PRINCIPALE")}</span>}
                </div>
                <div className="dash-featured-vehicle__info">
                  <div>
                    <h1 className="dash-featured-vehicle__name">{v.name}</h1>
                    <p className="dash-featured-vehicle__km">
                      {formatDistance(v.currentKm, distanceUnit, locale)}
                      <button
                        type="button"
                        className="dash-featured-vehicle__edit"
                        onClick={(e) => { e.stopPropagation(); onQuickKm(v); }}
                        aria-label={t("dashboardGarage.updateKm", "Aggiorna km")}
                      >
                        ✎
                      </button>
                    </p>
                  </div>
                  <span className="dash-featured-vehicle__chevron">›</span>
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
