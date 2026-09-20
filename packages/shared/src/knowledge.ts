/**
 * What CoSiMo knows about the MonoCab and about itself — the fact sheet
 * behind "Was ist das MonoCab?". Editable in the CMS (collection
 * `knowledge`, "Wissen"); these entries are the seed and the fallback while
 * the collection is empty. Facts only — checked by the project (2026-09-20);
 * the prompt tells the model to answer from these and to say so when
 * something is not in here.
 */
export type KnowledgeTopic = "monocab" | "cosimo";

export interface KnowledgeEntry {
  topic: KnowledgeTopic;
  title: string;
  body: string;
}

export const KNOWLEDGE_TOPIC_LABEL: Record<KnowledgeTopic, string> = { monocab: "MonoCab", cosimo: "CoSiMo" };

export const DEFAULT_KNOWLEDGE: KnowledgeEntry[] = [
  { topic: "monocab", title: "Was das MonoCab ist", body: "Ein neues Verkehrsmittel für den ländlichen Raum: kleine, selbstfahrende, elektrische Kabinen, die auf bestehenden, oft stillgelegten Bahnstrecken fahren. Motto: „Neue Mobilität auf alten Gleisen“." },
  { topic: "monocab", title: "Die Idee", body: "Viele Nebenstrecken sind stillgelegt, weil sich ein klassischer Zug dort nicht lohnt. Kleine Kabinen, die nur fahren, wenn jemand sie braucht, machen diese Strecken wieder nutzbar, ohne neue Trassen zu bauen." },
  { topic: "monocab", title: "Eine Schiene, zwei Richtungen", body: "Eine Kabine fährt auf nur einer der beiden Schienen eines normalen Gleises. So können sich zwei Kabinen auf demselben Gleis begegnen und aneinander vorbeifahren, eine links, eine rechts. Ein eingleisiges Nebengleis wird damit zur Strecke mit Verkehr in beide Richtungen." },
  { topic: "monocab", title: "Wie die Kabine aufrecht bleibt", body: "Damit die Kabine auf einer Schiene nicht kippt, hält sie sich mit Kreiseln im Inneren aufrecht, ähnlich wie ein Kreisel sich selbst im Gleichgewicht hält. Die Kabine wird dabei aktiv geregelt und bleibt auch im Stand stabil." },
  { topic: "monocab", title: "Platz und Barrierefreiheit", body: "Platz für 4 bis 6 Personen, mit ebenem Einstieg und Platz für Rollstuhl, Kinderwagen oder Fahrrad. Barrierefreiheit ist Teil des Konzepts, nicht Nachrüstung." },
  { topic: "monocab", title: "Automatischer Betrieb", body: "Die Kabinen fahren automatisch, ohne Fahrpersonal. Bei Bedarf gibt es Unterstützung aus der Leitstelle." },
  { topic: "monocab", title: "Zeitplan", body: "Ziel ist ein Testregelbetrieb mit echten Fahrgästen im Extertal ab etwa 2028 und ein serienreifes System Anfang der 2030er." },
  { topic: "monocab", title: "Wer das MonoCab entwickelt", body: "Entwickelt wird das MonoCab an der Technischen Hochschule Ostwestfalen-Lippe in Lemgo unter Leitung von Prof. Dr. Thomas Schulte. Die Idee stammt von Thorsten Försterling von der Landeseisenbahn Lippe. Partner sind die Hochschule Bielefeld, Fraunhofer IOSB-INA, das Deutsche Zentrum Mobilität der Zukunft in Minden, der RailCampus OWL und der Kreis Lippe." },
  { topic: "monocab", title: "Förderung und Auszeichnung", body: "Gefördert wird das Projekt von Land, Bund und EU. 2025 hat das MonoCab den RegioStars Award der Europäischen Kommission für regionale Innovation gewonnen." },
  { topic: "monocab", title: "Mehr erfahren", body: "Wer mehr wissen will: das Standpersonal fragen oder monocab-owl.de." },
  { topic: "cosimo", title: "Was CoSiMo ist", body: "CoSiMo steht für „Concierge System for Inclusive Mobility“. Es ist ein digitaler Begleiter für autonome Verkehrsmittel, der Fahrgäste über die ganze Reise begleitet, wenn niemand vom Personal mitfährt." },
  { topic: "cosimo", title: "Ein eigenes Projekt", body: "CoSiMo ist ein eigenes Forschungsprojekt, nicht Teil der MonoCab-Entwicklung. Das MonoCab ist das Reallabor, in dem CoSiMo prototypisch getestet wird, weil es dort keinen Fahrer gibt und die Kabine klein und persönlich ist." },
  { topic: "cosimo", title: "Was CoSiMo tut", body: "Auskunft zur Fahrt geben, bei der Bedienung helfen, Licht und Ton in der Kabine an die Person anpassen, Fragen beantworten und im Zweifel den Kontakt zu Menschen herstellen." },
  { topic: "cosimo", title: "Für wen", body: "Gedacht für alle, mit besonderem Blick auf ältere Menschen, Kinder, Frauen, Menschen mit Behinderungen und Menschen ohne eigenes Auto. Das System soll leicht verständlich, intuitiv und barrierearm sein." },
  { topic: "cosimo", title: "Wie CoSiMo gemacht ist", body: "Zurückhaltende Technik, die nur dann sichtbar wird, wenn man sie braucht. Es verarbeitet nur die Daten, die für die Fahrt nötig sind, und setzt auf Datenschutz und digitale Souveränität. Offene Standards, damit es herstellerübergreifend in verschiedenen Fahrzeugen funktionieren kann." },
  { topic: "cosimo", title: "Partner und Laufzeit", body: "Partner sind die TH OWL, die Hochschule Rhein-Waal und die XignSys GmbH. Das Projekt läuft von 2026 bis 2028 und wird von der EU und dem Land NRW gefördert." },
];

/** The prompt block stays under this many characters; the console warns when it is cut. */
export const KNOWLEDGE_MAX_CHARS = 6000;
