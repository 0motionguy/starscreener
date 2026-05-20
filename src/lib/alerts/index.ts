// Public surface for the alerts reader. Keep imports going through the
// barrel so internals can move without touching call sites.

export {
  listAlertsForUser,
  type AccountAlertEvent,
} from "./queries";
