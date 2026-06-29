import CosimoKiosk from "../../components/CosimoKiosk";

/**
 * The iPad kiosk experience. Phase 1.5 wires CoSiMo's animated Face to the
 * realtime service and adds the text-fallback conversation. Voice (push-to-talk)
 * and the full accessible UX follow in Phases 4–5.
 */
export default function Home() {
  return <CosimoKiosk />;
}
