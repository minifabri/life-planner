import { weekdayName, type LocalDate } from "@/lib/dates/local";
import { MIN_MEALS, NUTRIENT_LABEL, balanceNote, type Balance } from "@/lib/meals/nutrients";

/** Il segno di una casella: più pasti del giorno portano il nutriente, più è pieno. */
function dotClass(count: number): string {
  if (count === 0) return "size-1.5 border border-line-2";
  if (count === 1) return "size-1.5 bg-text-3";
  if (count === 2) return "size-2 bg-text-2";
  return "size-2.5 bg-text";
}

/** Come si distribuiscono proteine, carboidrati, grassi e fibre nei pasti della settimana. */
export function BalanceCard({ balance, days, today }: { balance: Balance; days: LocalDate[]; today: LocalDate }) {
  return (
    <section aria-label="Nutrienti della settimana" className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface px-4 py-3">
      <div className="flex flex-col gap-1">
        <h2 className="label-mono">Nutrienti della settimana</h2>
        <p className="text-[15px] text-text">{balanceNote(balance)}</p>
      </div>
      {balance.recognized > 0 ? (
        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr>
              <th scope="col" className="w-[92px] text-left">
                <span className="sr-only">Nutriente</span>
              </th>
              {days.map((d) => (
                <th key={d} scope="col" className={`pb-1 font-mono text-[10.5px] font-medium uppercase ${d === today ? "text-accent" : "text-text-3"}`}>
                  <span aria-hidden>{weekdayName(d).charAt(0)}</span>
                  <span className="sr-only">{weekdayName(d)}</span>
                </th>
              ))}
              <th scope="col" className="w-9 pb-1 text-right font-mono text-[10.5px] font-medium uppercase text-text-3">
                <span aria-hidden>Tot</span>
                <span className="sr-only">Pasti nella settimana</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {balance.rows.map((row) => (
              <tr key={row.nutrient}>
                <th scope="row" className={`h-7 text-left text-[13px] font-normal ${row.low ? "text-text" : "text-text-2"}`}>
                  {NUTRIENT_LABEL[row.nutrient]}
                  {row.low ? <span className="sr-only"> (poco presente)</span> : null}
                </th>
                {row.perDay.map((count, i) => (
                  <td key={days[i]} className="text-center">
                    <span aria-hidden className={`inline-block rounded-full align-middle ${dotClass(count)}`} />
                    <span className="sr-only">{count}</span>
                  </td>
                ))}
                <td className="text-right font-mono text-[11px] text-text-3">{row.meals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {balance.planned > 0 ? (
        <p className="text-xs text-text-3">
          {balance.recognized === balance.planned
            ? `Su ${balance.planned === 1 ? "1 pasto" : `${balance.planned} pasti`} in programma.`
            : `Su ${balance.recognized} di ${balance.planned} pasti: degli altri il nome non dice i nutrienti.`}{" "}
          {balance.recognized >= MIN_MEALS ? "È un'indicazione dai nomi dei piatti, non dalle quantità." : null}
        </p>
      ) : null}
    </section>
  );
}
