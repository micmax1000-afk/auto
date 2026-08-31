import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Vehicle, FuelEntry, ChargingEntry, MaintenanceEntry, ExpenseEntry, Reminder } from "./types";
import {
  initStorage,
  loadVehicles,
  putVehicle,
  deleteVehicle,
  loadFuelEntries,
  putFuelEntry,
  deleteFuelEntry,
  loadChargingEntries,
  putChargingEntry,
  deleteChargingEntry,
  loadMaintenanceEntries,
  putMaintenanceEntry,
  deleteMaintenanceEntry,
  loadExpenseEntries,
  putExpenseEntry,
  deleteExpenseEntry,
  loadReminders,
  putReminder,
  deleteReminder,
  generateId,
} from "./utils/storage";
import { isReminderDue } from "./utils/calculations";
import { areNotificationsEnabled, notifyDueReminders, type NotifiableReminder } from "./utils/notifications";
import { getNumberLocale } from "./utils/locale";
import { formatDistance } from "./utils/settings";
import { useAppSettings } from "./contexts/AppSettingsContext";
import { applyTheme, getInitialTheme, setStoredTheme, type Theme } from "./utils/theme";
import { isRtlLanguage } from "./i18n";
import VehicleCard from "./components/VehicleCard";
import VehicleForm from "./components/VehicleForm";
import VehicleDetail from "./components/VehicleDetail";
import QuickKmUpdate from "./components/QuickKmUpdate";
import BackupPanel from "./components/BackupPanel";
import SettingsScreen from "./components/SettingsScreen";
import UtilitiesScreen from "./components/UtilitiesScreen";
import Dashboard from "./components/Dashboard";
import BottomTabBar, { type TabId } from "./components/BottomTabBar";
import PremiumScreen from "./components/PremiumScreen";
import TireCalculator from "./components/TireCalculator";
import VehiclePickerModal from "./components/VehiclePickerModal";
import Onboarding from "./components/Onboarding";
import { getMeta, setMeta } from "./utils/db";
import QuickFuelForm from "./components/QuickFuelForm";
import QuickChargeForm from "./components/QuickChargeForm";
import KmHistory from "./components/KmHistory";
import { useProStatus, FREE_VEHICLE_LIMIT } from "./services/billing/useProStatus";

// Mappa il tab della bottom bar alla scheda di dettaglio veicolo da aprire
type DetailTabTarget = "live" | "rifornimenti" | "manutenzioni" | "spese" | "scadenze" | "tragitto" | "riepilogo";

type PendingAction =
  | { kind: "navigate"; tab: DetailTabTarget }
  | { kind: "quickFuel" }
  | { kind: "quickCharge" };

const MAIN_TAB_TO_DETAIL_TAB: Record<"manutenzione" | "statistiche" | "movimenti", DetailTabTarget> = {
  manutenzione: "manutenzioni",
  statistiche: "riepilogo",
  movimenti: "rifornimenti",
};

export default function App() {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [chargingEntries, setChargingEntries] = useState<ChargingEntry[]>([]);
  const [maintenanceEntries, setMaintenanceEntries] = useState<MaintenanceEntry[]>([]);
  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntry[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  const [mainTab, setMainTab] = useState<TabId>("garage");
  const [quickFuelVehicleId, setQuickFuelVehicleId] = useState<string | null>(null);
  const [quickChargeVehicleId, setQuickChargeVehicleId] = useState<string | null>(null);
  const [showBackup, setShowBackup] = useState(false);
  const [showUtilities, setShowUtilities] = useState(false);
  const [showManageVehicles, setShowManageVehicles] = useState(false);
  const [openVehicleId, setOpenVehicleId] = useState<string | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<DetailTabTarget>("live");
  const [pendingVehicleAction, setPendingVehicleAction] = useState<PendingAction | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [showNewVehicleForm, setShowNewVehicleForm] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const [showTireCalc, setShowTireCalc] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const { isPro, refresh: refreshProStatus } = useProStatus();
  const { distanceUnit } = useAppSettings();
  const [quickKmVehicle, setQuickKmVehicle] = useState<Vehicle | null>(null);
  const [kmHistoryVehicleId, setKmHistoryVehicleId] = useState<string | null>(null);

  function handleToggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    setStoredTheme(next);
  }

  async function reloadAll() {
    const [vehiclesData, fuelData, chargingData, maintenanceData, expensesData, remindersData] = await Promise.all([
      loadVehicles(),
      loadFuelEntries(),
      loadChargingEntries(),
      loadMaintenanceEntries(),
      loadExpenseEntries(),
      loadReminders(),
    ]);
    setVehicles(vehiclesData);
    setFuelEntries(fuelData);
    setChargingEntries(chargingData);
    setMaintenanceEntries(maintenanceData);
    setExpenseEntries(expensesData);
    setReminders(remindersData);
  }

  useEffect(() => {
    (async () => {
      // migra eventuali dati da localStorage (versioni precedenti dell'app) prima del primo caricamento
      await initStorage();
      await reloadAll();
      const seen = await getMeta("onboarding:seen");
      setShowOnboarding(seen !== "true");
      setLoading(false);
    })();
  }, []);

  async function handleSkipOnboarding() {
    await setMeta("onboarding:seen", "true");
    setShowOnboarding(false);
  }

  async function handleFinishOnboarding() {
    await setMeta("onboarding:seen", "true");
    setShowOnboarding(false);
    setShowNewVehicleForm(true);
  }

  // Controlla le scadenze imminenti/scadute e invia notifiche del browser,
  // se l'utente le ha attivate. Al massimo una per promemoria al giorno.
  useEffect(() => {
    if (!areNotificationsEnabled() || vehicles.length === 0 || reminders.length === 0) return;

    const items: NotifiableReminder[] = [];
    for (const reminder of reminders) {
      if (reminder.completed) continue;
      const vehicle = vehicles.find((v) => v.id === reminder.vehicleId);
      if (!vehicle) continue;
      const status = isReminderDue(reminder.dueDate, reminder.dueKm, vehicle.currentKm);
      if (status === "ok") continue;
      items.push({
        id: reminder.id,
        label: reminder.label,
        vehicleName: vehicle.name,
        status,
        dueDate: reminder.dueDate,
      });
    }
    notifyDueReminders(
      items,
      { overdue: t("notif.overdue"), soon: t("notif.soon"), dueOnPrefix: t("notif.dueOnPrefix") },
      getNumberLocale(i18n.language),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, reminders]);

  // Aggiorna il km del veicolo in stato locale + storage se un nuovo record lo supera
  // (rifornimento, ricarica o manutenzione più recente del km salvato sul veicolo).
  async function bumpVehicleKmIfNeeded(vehicleId: string, newKm: number) {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle || newKm <= vehicle.currentKm) return;
    const updated = { ...vehicle, currentKm: newKm };
    setVehicles((prev) => prev.map((v) => (v.id === vehicleId ? updated : v)));
    await putVehicle(updated);
  }

  // ---------- Veicoli ----------

  async function handleSaveVehicle(vehicle: Vehicle) {
    const exists = vehicles.some((v) => v.id === vehicle.id);
    // difesa in profondità: anche se il form fosse aperto senza passare da
    // handleRequestAddVehicle, non permettere comunque di superare il limite
    if (!exists && !isPro && activeVehicleCount >= FREE_VEHICLE_LIMIT) {
      setShowNewVehicleForm(false);
      setShowPremium(true);
      return;
    }
    setVehicles((prev) => (exists ? prev.map((v) => (v.id === vehicle.id ? vehicle : v)) : [...prev, vehicle]));
    setShowNewVehicleForm(false);
    setEditingVehicle(null);
    await putVehicle(vehicle);
  }

  async function handleArchiveVehicle(id: string) {
    const target = vehicles.find((v) => v.id === id);
    if (!target) return;
    const updated: Vehicle = { ...target, archived: true, archivedAt: new Date().toISOString() };
    setVehicles((prev) => prev.map((v) => (v.id === id ? updated : v)));
    if (openVehicleId === id) setOpenVehicleId(null);
    await putVehicle(updated);
  }

  async function handleRestoreVehicle(id: string) {
    const target = vehicles.find((v) => v.id === id);
    if (!target) return;
    const updated: Vehicle = { ...target, archived: false, archivedAt: undefined };
    setVehicles((prev) => prev.map((v) => (v.id === id ? updated : v)));
    await putVehicle(updated);
  }

  async function handleDeleteVehicle(id: string) {
    setVehicles((prev) => prev.filter((v) => v.id !== id));
    const relatedFuel = fuelEntries.filter((e) => e.vehicleId === id);
    const relatedCharging = chargingEntries.filter((e) => e.vehicleId === id);
    const relatedMaint = maintenanceEntries.filter((e) => e.vehicleId === id);
    const relatedExpenses = expenseEntries.filter((e) => e.vehicleId === id);
    const relatedReminders = reminders.filter((r) => r.vehicleId === id);

    setFuelEntries((prev) => prev.filter((e) => e.vehicleId !== id));
    setChargingEntries((prev) => prev.filter((e) => e.vehicleId !== id));
    setMaintenanceEntries((prev) => prev.filter((e) => e.vehicleId !== id));
    setExpenseEntries((prev) => prev.filter((e) => e.vehicleId !== id));
    setReminders((prev) => prev.filter((r) => r.vehicleId !== id));
    if (openVehicleId === id) setOpenVehicleId(null);

    await Promise.all([
      deleteVehicle(id),
      ...relatedFuel.map((e) => deleteFuelEntry(e.id)),
      ...relatedCharging.map((e) => deleteChargingEntry(e.id)),
      ...relatedMaint.map((e) => deleteMaintenanceEntry(e.id)),
      ...relatedExpenses.map((e) => deleteExpenseEntry(e.id)),
      ...relatedReminders.map((r) => deleteReminder(r.id)),
    ]);
  }

  async function handleQuickKmSave(km: number) {
    if (!quickKmVehicle) return;
    const updated: Vehicle = { ...quickKmVehicle, currentKm: km };
    setQuickKmVehicle(null);
    await handleSaveVehicle(updated);
  }

  // ---------- Rifornimenti ----------

  async function handleSaveFuel(entry: FuelEntry) {
    const exists = fuelEntries.some((e) => e.id === entry.id);
    setFuelEntries((prev) => (exists ? prev.map((e) => (e.id === entry.id ? entry : e)) : [...prev, entry]));
    await putFuelEntry(entry);
    await bumpVehicleKmIfNeeded(entry.vehicleId, entry.km);
  }

  async function handleDeleteFuel(id: string) {
    setFuelEntries((prev) => prev.filter((e) => e.id !== id));
    await deleteFuelEntry(id);
  }

  // ---------- Ricariche elettriche ----------

  async function handleSaveCharging(entry: ChargingEntry) {
    const exists = chargingEntries.some((e) => e.id === entry.id);
    setChargingEntries((prev) => (exists ? prev.map((e) => (e.id === entry.id ? entry : e)) : [...prev, entry]));
    await putChargingEntry(entry);
    await bumpVehicleKmIfNeeded(entry.vehicleId, entry.km);
  }

  async function handleDeleteCharging(id: string) {
    setChargingEntries((prev) => prev.filter((e) => e.id !== id));
    await deleteChargingEntry(id);
  }

  // ---------- Manutenzioni ----------

  async function handleAddMaintenance(entry: MaintenanceEntry) {
    setMaintenanceEntries((prev) => [...prev, entry]);
    await putMaintenanceEntry(entry);
    await bumpVehicleKmIfNeeded(entry.vehicleId, entry.km);
  }

  async function handleDeleteMaintenance(id: string) {
    setMaintenanceEntries((prev) => prev.filter((e) => e.id !== id));
    await deleteMaintenanceEntry(id);
  }

  // ---------- Spese ----------

  async function handleAddExpense(entry: ExpenseEntry) {
    setExpenseEntries((prev) => [...prev, entry]);
    await putExpenseEntry(entry);
  }

  async function handleDeleteExpense(id: string) {
    setExpenseEntries((prev) => prev.filter((e) => e.id !== id));
    await deleteExpenseEntry(id);
  }

  // ---------- Scadenze ----------

  async function handleAddReminder(reminder: Reminder) {
    setReminders((prev) => [...prev, reminder]);
    await putReminder(reminder);
  }

  async function handleToggleReminder(id: string) {
    const target = reminders.find((r) => r.id === id);
    if (!target) return;
    const updated: Reminder = { ...target, completed: !target.completed };
    const toPut: Reminder[] = [updated];

    // se viene completata (non riattivata) e ha un intervallo di ripetizione, crea la prossima occorrenza
    if (!target.completed && (target.repeatMonths || target.repeatKm)) {
      const vehicle = vehicles.find((v) => v.id === target.vehicleId);
      const nextReminder: Reminder = { ...target, id: generateId(), completed: false };
      if (target.type === "data" && target.repeatMonths) {
        const due = new Date();
        due.setMonth(due.getMonth() + target.repeatMonths);
        nextReminder.dueDate = due.toISOString();
      }
      if (target.type === "km" && target.repeatKm && vehicle) {
        nextReminder.dueKm = vehicle.currentKm + target.repeatKm;
      }
      toPut.push(nextReminder);
    }

    setReminders((prev) => {
      const withUpdated = prev.map((r) => (r.id === id ? updated : r));
      return toPut.length > 1 ? [...withUpdated, toPut[1]] : withUpdated;
    });

    await Promise.all(toPut.map((r) => putReminder(r)));
  }

  async function handleDeleteReminder(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    await deleteReminder(id);
  }

  const openVehicle = vehicles.find((v) => v.id === openVehicleId) ?? null;
  const activeVehicleCount = vehicles.filter((v) => !v.archived).length;

  // Punto unico da cui passa ogni "+ Aggiungi veicolo" dell'app: se il limite
  // gratuito è raggiunto e Pro non è sbloccato, mostra la schermata di
  // acquisto invece del form — non un vicolo cieco silenzioso.
  function handleRequestAddVehicle() {
    if (!isPro && activeVehicleCount >= FREE_VEHICLE_LIMIT) {
      setShowPremium(true);
      return;
    }
    setShowNewVehicleForm(true);
  }

  // Punto unico da cui passa ogni azione globale che deve coinvolgere un
  // veicolo specifico (navigazione a una scheda, o inserimento rapido
  // rifornimento/ricarica): con 0 veicoli propone di aggiungerne uno, con 1
  // lo usa direttamente, con 2+ FORZA la scelta esplicita — mai un
  // vehicles[0] silenzioso, per non rischiare di registrare dati sul
  // veicolo sbagliato.
  function requestVehicleAction(action: PendingAction) {
    const active = vehicles.filter((v) => !v.archived);
    if (active.length === 0) {
      setShowNewVehicleForm(true);
      return;
    }
    if (active.length === 1) {
      completeVehicleAction(active[0].id, action);
      return;
    }
    setPendingVehicleAction(action);
  }

  function completeVehicleAction(vehicleId: string, action: PendingAction) {
    if (action.kind === "navigate") {
      setDetailInitialTab(action.tab);
      setOpenVehicleId(vehicleId);
    } else if (action.kind === "quickFuel") {
      setQuickFuelVehicleId(vehicleId);
    } else if (action.kind === "quickCharge") {
      setQuickChargeVehicleId(vehicleId);
    }
  }

  function handleVehiclePicked(vehicleId: string) {
    if (pendingVehicleAction) {
      completeVehicleAction(vehicleId, pendingVehicleAction);
    }
    setPendingVehicleAction(null);
  }

  const urgentTotalCount = reminders.filter((r) => {
    if (r.completed) return false;
    const vehicle = vehicles.find((v) => v.id === r.vehicleId);
    if (!vehicle || vehicle.archived) return false;
    return isReminderDue(r.dueDate, r.dueKm, vehicle.currentKm) !== "ok";
  }).length;

  // Navigazione principale mobile: 5 aree, con le funzioni secondarie raccolte in "Altro".
  function handleMainTabChange(tab: TabId) {
    setShowBackup(false);
    setShowManageVehicles(false);
    if (tab === "garage") {
      setMainTab("garage");
      setOpenVehicleId(null);
      return;
    }
    if (tab === "movimenti") {
      setMainTab("movimenti");
      requestVehicleAction({ kind: "navigate", tab: MAIN_TAB_TO_DETAIL_TAB.movimenti });
      return;
    }
    if (tab === "manutenzione" || tab === "statistiche") {
      setMainTab(tab);
      requestVehicleAction({ kind: "navigate", tab: MAIN_TAB_TO_DETAIL_TAB[tab] });
      return;
    }
    if (tab === "impostazioni") {
      setMainTab("impostazioni");
      setOpenVehicleId(null);
      return;
    }
    setMainTab("garage");
    setOpenVehicleId(null);
  }

  function handleBackFromDetail() {
    setOpenVehicleId(null);
    setMainTab("garage");
  }

  function urgentRemindersCount(vehicleId: string, currentKm: number): number {
    return reminders.filter(
      (r) => r.vehicleId === vehicleId && !r.completed && isReminderDue(r.dueDate, r.dueKm, currentKm) !== "ok",
    ).length;
  }

  function hasUrgentReminder(vehicleId: string, currentKm: number): boolean {
    return reminders.some(
      (r) =>
        r.vehicleId === vehicleId &&
        !r.completed &&
        isReminderDue(r.dueDate, r.dueKm, currentKm) !== "ok",
    );
  }

  if (loading) {
    return (
      <div className="app">
        <div className="app-loading">
          <span className="app-loading__spinner" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return <Onboarding onSkip={handleSkipOnboarding} onFinish={handleFinishOnboarding} />;
  }

  return (
    <div className="app">
      <main
        className="content"
        key={`${mainTab}-${showBackup ? "backup" : "app"}-${openVehicleId ?? "list"}`}
      >
        {showBackup && (
          <section>
            <div className="section-head">
              <h1>{t("backup.title")}</h1>
              <button type="button" className="btn btn--ghost" onClick={() => setShowBackup(false)}>
                {isRtlLanguage(i18n.language) ? "→ " : "← "}
                {t("detail.back")}
              </button>
            </div>
            <BackupPanel
              vehicles={vehicles}
              fuelEntries={fuelEntries}
              maintenanceEntries={maintenanceEntries}
              expenseEntries={expenseEntries}
              onRestored={reloadAll}
            />
          </section>
        )}

        {!showBackup && showManageVehicles && !openVehicle && (
          <section>
            <div className="home-hero">
              <div className="section-head home-hero__head">
                <h1>{t("vehicles.title")}</h1>
                <button type="button" className="btn btn--ghost" onClick={() => setShowManageVehicles(false)}>
                  {isRtlLanguage(i18n.language) ? "→ " : "← "}
                  {t("detail.back")}
                </button>
              </div>
            </div>

            {vehicles.filter((v) => !v.archived).length === 0 ? (
              <div className="empty-state">
                <p className="empty-state__title">{t("vehicles.emptyActiveTitle")}</p>
                <p className="empty-state__body">
                  {vehicles.length === 0 ? t("vehicles.emptyNoneBody") : t("vehicles.emptyAllArchivedBody")}
                </p>
                <button type="button" className="btn btn--primary" onClick={handleRequestAddVehicle}>
                  {t("vehicles.add")}
                </button>
              </div>
            ) : (
              <div className="vehicle-grid">
                {vehicles
                  .filter((v) => !v.archived)
                  .map((v) => (
                    <div key={v.id} className="vehicle-grid__item">
                      {hasUrgentReminder(v.id, v.currentKm) && (
                        <span className="vehicle-grid__alert" title={t("vehicles.urgentReminderTitle")}>
                          ⚠ {urgentRemindersCount(v.id, v.currentKm)}
                        </span>
                      )}
                      <VehicleCard
                        vehicle={v}
                        onOpen={(id) => {
                          setOpenVehicleId(id);
                          setDetailInitialTab("live");
                        }}
                        onEdit={(id) => setEditingVehicle(vehicles.find((veh) => veh.id === id) ?? null)}
                        onQuickKm={(id) => setQuickKmVehicle(vehicles.find((veh) => veh.id === id) ?? null)}
                        onDelete={handleArchiveVehicle}
                      />
                    </div>
                  ))}
              </div>
            )}

            {vehicles.some((v) => v.archived) && (
              <div className="archived-section">
                <h2 className="archived-section__title">{t("vehicles.soldSection")}</h2>
                <div className="archived-list">
                  {vehicles
                    .filter((v) => v.archived)
                    .map((v) => (
                      <div key={v.id} className="archived-item">
                        <div className="archived-item__info">
                          <span className="archived-item__name">{v.name}</span>
                          <span className="archived-item__meta">
                            {formatDistance(v.currentKm, distanceUnit, getNumberLocale(i18n.language))}
                            {v.archivedAt
                              ? ` · ${t("vehicles.soldOn", { date: new Date(v.archivedAt).toLocaleDateString(getNumberLocale(i18n.language)) })}`
                              : ""}
                          </span>
                        </div>
                        <div className="archived-item__actions">
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            onClick={() => handleRestoreVehicle(v.id)}
                          >
                            {t("vehicles.restore")}
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--danger btn--small"
                            onClick={() => {
                              if (window.confirm(t("vehicles.deleteForeverConfirm", { name: v.name }))) {
                                handleDeleteVehicle(v.id);
                              }
                            }}
                          >
                            {t("vehicles.deleteForever")}
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </section>
        )}

        {!showBackup && !showManageVehicles && !openVehicle && !showUtilities && mainTab === "impostazioni" && (
          <SettingsScreen
            onClose={() => setMainTab("garage")}
            onOpenBackup={() => setShowBackup(true)}
            theme={theme}
            onToggleTheme={handleToggleTheme}
          />
        )}

        {!showBackup && !showManageVehicles && !openVehicle && showUtilities && (
          <UtilitiesScreen
            onClose={() => setShowUtilities(false)}
            onOpenReminders={() => { setShowUtilities(false); requestVehicleAction({ kind: "navigate", tab: "scadenze" }); }}
            onOpenExpenses={() => { setShowUtilities(false); requestVehicleAction({ kind: "navigate", tab: "spese" }); }}
            onOpenTireCalc={() => setShowTireCalc(true)}
            onOpenCommute={() => { setShowUtilities(false); requestVehicleAction({ kind: "navigate", tab: "tragitto" }); }}
            onOpenKmHistory={() => {
              setShowUtilities(false);
              const target = vehicles.find((v) => !v.archived);
              if (target) setKmHistoryVehicleId(target.id);
            }}
          />
        )}

        {!showBackup && !showManageVehicles && !openVehicle && !showUtilities && mainTab !== "impostazioni" && (
          <Dashboard
            vehicles={vehicles}
            reminders={reminders}
            maintenanceEntries={maintenanceEntries}
            fuelEntries={fuelEntries}
            chargingEntries={chargingEntries}
            expenseEntries={expenseEntries}
            isPro={isPro}
            onOpenVehicle={(id) => {
              setOpenVehicleId(id);
              setDetailInitialTab("live");
            }}
            onAddVehicle={handleRequestAddVehicle}
            onManageVehicles={() => setShowManageVehicles(true)}
            onQuickFuel={() => requestVehicleAction({ kind: "quickFuel" })}
            onQuickCharge={() => requestVehicleAction({ kind: "quickCharge" })}
            onQuickKm={(vehicle) => setQuickKmVehicle(vehicle)}
            onOpenReminder={() => requestVehicleAction({ kind: "navigate", tab: "scadenze" })}
            onOpenReminders={() => requestVehicleAction({ kind: "navigate", tab: "scadenze" })}
            onOpenMaintenance={() => requestVehicleAction({ kind: "navigate", tab: "manutenzioni" })}
            onOpenStats={() => requestVehicleAction({ kind: "navigate", tab: "riepilogo" })}
            onOpenUtilities={() => setShowUtilities(true)}
            onOpenPremium={() => setShowPremium(true)}
          />
        )}

        {!showBackup && openVehicle && (
          <VehicleDetail
            vehicle={openVehicle}
            fuelEntries={fuelEntries.filter((e) => e.vehicleId === openVehicle.id)}
            chargingEntries={chargingEntries.filter((e) => e.vehicleId === openVehicle.id)}
            maintenanceEntries={maintenanceEntries.filter((e) => e.vehicleId === openVehicle.id)}
            expenseEntries={expenseEntries.filter((e) => e.vehicleId === openVehicle.id)}
            reminders={reminders.filter((r) => r.vehicleId === openVehicle.id)}
            initialTab={detailInitialTab}
            restrictToTab={detailInitialTab}
            onBack={handleBackFromDetail}
            onSaveFuel={handleSaveFuel}
            onDeleteFuel={handleDeleteFuel}
            onSaveCharging={handleSaveCharging}
            onDeleteCharging={handleDeleteCharging}
            onAddMaintenance={handleAddMaintenance}
            onDeleteMaintenance={handleDeleteMaintenance}
            onAddExpense={handleAddExpense}
            onDeleteExpense={handleDeleteExpense}
            onAddReminder={handleAddReminder}
            onToggleReminder={handleToggleReminder}
            onDeleteReminder={handleDeleteReminder}
          />
        )}
      </main>

      {!showBackup && !showManageVehicles && (
        <BottomTabBar active={mainTab} onChange={handleMainTabChange} urgentCount={urgentTotalCount} />
      )}

      {showNewVehicleForm && (
        <VehicleForm onSave={handleSaveVehicle} onClose={() => setShowNewVehicleForm(false)} />
      )}

      {editingVehicle && (
        <VehicleForm
          initialVehicle={editingVehicle}
          onSave={handleSaveVehicle}
          onClose={() => setEditingVehicle(null)}
          onArchive={(id) => {
            handleArchiveVehicle(id);
            setEditingVehicle(null);
          }}
        />
      )}

      {quickKmVehicle && (
        <QuickKmUpdate
          vehicle={quickKmVehicle}
          onSave={handleQuickKmSave}
          onClose={() => setQuickKmVehicle(null)}
        />
      )}

      {showPremium && (
        <PremiumScreen
          onClose={() => {
            setShowPremium(false);
            refreshProStatus();
          }}
        />
      )}

      {showTireCalc && <TireCalculator onClose={() => setShowTireCalc(false)} />}

      {pendingVehicleAction && (
        <VehiclePickerModal
          vehicles={vehicles.filter((v) => !v.archived)}
          onSelect={handleVehiclePicked}
          onClose={() => setPendingVehicleAction(null)}
        />
      )}

      {kmHistoryVehicleId &&
        (() => {
          const v = vehicles.find((veh) => veh.id === kmHistoryVehicleId);
          if (!v) return null;
          return (
            <KmHistory
              vehicle={v}
              fuelEntries={fuelEntries.filter((f) => f.vehicleId === v.id)}
              chargingEntries={chargingEntries.filter((c) => c.vehicleId === v.id)}
              onBack={() => setKmHistoryVehicleId(null)}
              onUpdateKm={() => {
                setKmHistoryVehicleId(null);
                setQuickKmVehicle(v);
              }}
            />
          );
        })()}

      {quickFuelVehicleId &&
        (() => {
          const v = vehicles.find((veh) => veh.id === quickFuelVehicleId);
          if (!v) return null;
          return (
            <QuickFuelForm
              vehicle={v}
              existingEntries={fuelEntries.filter((f) => f.vehicleId === v.id)}
              onSave={(entry) => {
                handleSaveFuel(entry);
                setQuickFuelVehicleId(null);
              }}
              onClose={() => setQuickFuelVehicleId(null)}
            />
          );
        })()}

      {quickChargeVehicleId &&
        (() => {
          const v = vehicles.find((veh) => veh.id === quickChargeVehicleId);
          if (!v) return null;
          return (
            <QuickChargeForm
              vehicle={v}
              existingEntries={chargingEntries.filter((c) => c.vehicleId === v.id)}
              onSave={(entry) => {
                handleSaveCharging(entry);
                setQuickChargeVehicleId(null);
              }}
              onClose={() => setQuickChargeVehicleId(null)}
            />
          );
        })()}
    </div>
  );
}
