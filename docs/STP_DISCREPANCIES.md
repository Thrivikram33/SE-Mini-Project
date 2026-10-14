# Approved STP discrepancies (not edited)

Reviewed against `Railway_Reservation_System_Test_Plan.docx` and the SRS RTM on 2026-10-14. The approved source document remains unchanged.

| Original STP item | As written | Traceability concern | Proposed clarification for document owners |
|---|---|---|---|
| `TC-ADMIN-02` | Admin updates fare/seat inventory; change persists and search reflects it. | Same scenario and expected result as `TC-ADMIN-03`. | Confirm whether one case should be removed/renumbered or whether the cases should cover distinct fare and inventory behaviors. Do not silently choose an identifier. |
| `TC-ADMIN-03` | Admin updates fare and seat inventory; change persists and search reflects it. | Duplicate of `TC-ADMIN-02`. | Keep the original ID until the QA lead/product owner approves a correction. |
| `TC-CAN-04` | “Cancel then search availability”; expected seat release; mapped to `RRS-F-015`. | Scenario exercises cancellation and returned inventory, which align with `RRS-F-013` and its seat-release acceptance, rather than administrator management `RRS-F-015`. The SRS RTM does not list `TC-CAN-04`. | Confirm mapping to `RRS-F-013` and add the test to the RTM, or revise the scenario if F-015 was intended. |

These discrepancies affect requirement coverage and acceptance reporting. Until owners resolve them, reports should retain the original IDs and explicitly call out the suspected duplicate/mapping issue.
