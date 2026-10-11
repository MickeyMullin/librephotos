import { showNotification } from "@mantine/notifications";
import i18n from "../../i18n";
import { INTERACTIVE_TOAST_STYLE } from "./interactive";

function jobFinished(title: string, job: string) {
  showNotification({
    message: i18n.t("toasts.jobfinished", { job }),
    title,
    color: "teal",
  });
}

function jobCancelled() {
  showNotification({
    message: i18n.t("toasts.jobcancelled"),
    title: i18n.t("toasts.jobcancelledtitle"),
    color: "orange",
  });
}

function requestFailed(title: string, message: string) {
  showNotification({
    message,
    title,
    color: "red",
    // Longer than the 2 s of a confirmation, and closable: an error has to be
    // read, and is rare enough not to get in the way.
    autoClose: 6000,
    style: INTERACTIVE_TOAST_STYLE,
  });
}

export const worker = {
  jobCancelled,
  jobFinished,
  requestFailed,
};
