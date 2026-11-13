import { countLabel, readyPatients } from "@kineo/shared";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Screen } from "../components/Screen";
import { usePracticeData } from "../data/PracticeStoreProvider";

/**
 * Ready to invoice: the patients with visits not on an invoice yet, the one waiting
 * longest first. Picking one opens their page, where Create invoice starts the draft.
 */
export function ReadyToInvoice() {
  const navigate = useNavigate();
  const { patients, visits } = usePracticeData();
  const rows = useMemo(() => readyPatients(patients, visits), [patients, visits]);

  return (
    <Screen back title="Ready to invoice">
      {rows.length === 0 ? (
        <div className="rounded-2xl bg-surface px-6 py-10 text-center shadow-surface">
          <p className="font-medium">You're all caught up</p>
          <p className="text-sm text-muted">Every visit is on an invoice.</p>
        </div>
      ) : (
        <ul
          aria-label="Patients ready to invoice"
          className="flex flex-col divide-y divide-separator rounded-2xl bg-surface shadow-surface"
        >
          {rows.map(({ patient, visitCount }) => {
            const count = countLabel(visitCount, "visit");
            return (
              <li key={patient.id}>
                <button
                  type="button"
                  aria-label={`${patient.fullName}, ${count}`}
                  onClick={() => void navigate(`/patients/${patient.id}`)}
                  className="flex min-h-14 w-full items-center justify-between gap-4 px-4 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <span className="font-medium">{patient.fullName}</span>
                  <span className="text-[13px] text-muted tabular-nums">{count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}
