/**
 * FrameKind: closed vocabulary of router-frame kinds (P9, dispatch contract).
 *
 * Payload width law per kind (all widths pinned; widths imported from
 * @repop/abi where the frame is an abi frame).
 *
 * UNVERIFIED-vs-P9-plan: the P9 plan file (docs/jira/v26.11.8/plans/09-*.md)
 * has not landed — every width below is from the dispatch contract, which
 * pins kinds 0/1/3/4; kind 2 (KERNEL_READY) width 0 is pinned here by this
 * lane as the only lawful empty-payload frame (unsolicited boot event).
 */

import { FRAME_SIZE } from "@repop/abi";

export const FrameKind = {
  SUBMIT_INTENT: 0,
  INTENT_RESOLVED: 1,
  KERNEL_READY: 2,
  REGISTER_OBJECT: 3,
  REFUSE: 4,
} as const;

export type FrameKind = (typeof FrameKind)[keyof typeof FrameKind];

/** Payload widths per kind, bytes. */
export const PAYLOAD_WIDTH: Readonly<Record<FrameKind, number>> = {
  [FrameKind.SUBMIT_INTENT]: FRAME_SIZE,
  [FrameKind.INTENT_RESOLVED]: FRAME_SIZE, // receipt width = 64B per abi
  [FrameKind.KERNEL_READY]: 0,
  [FrameKind.REGISTER_OBJECT]: FRAME_SIZE,
  [FrameKind.REFUSE]: 16,
};

/** True iff `v` is a lawful FrameKind value. */
export function isFrameKind(v: number): v is FrameKind {
  return (
    v === FrameKind.SUBMIT_INTENT ||
    v === FrameKind.INTENT_RESOLVED ||
    v === FrameKind.KERNEL_READY ||
    v === FrameKind.REGISTER_OBJECT ||
    v === FrameKind.REFUSE
  );
}
