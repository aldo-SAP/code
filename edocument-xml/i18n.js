/*
 * Language support for the eDocument XML viewer (load before the rules and app.js).
 *
 * The code is written in English; this file holds the Italian. T("English text", vars) returns the
 * translation with {name} placeholders filled. Check messages are built from data (amounts, line names,
 * VAT categories), so tr() translates a finished English message instead: an exact match first, then a
 * pattern with {placeholders} whose captured parts are translated in turn, and finally known words.
 * Anything without a translation is shown in English.
 */
(function () {
  "use strict";
  const KEY = "edocxml.lang";
  const LANGS = { en: { name: "English", locale: "en-GB" }, it: { name: "Italiano", locale: "it-IT" } };
  let lang = "en";
  try { const s = localStorage.getItem(KEY); if (LANGS[s]) lang = s; } catch (e) {}

  // ---------- Italian: exact texts ----------
  const IT = {
    // Page
    "eDocument XML Viewer": "Visualizzatore XML eDocument",
    "XML Viewer": "Visualizzatore XML",
    "All tools": "Tutti gli strumenti",
    "Language": "Lingua",
    "Drop a UBL invoice or credit note XML here, or paste it anywhere with Ctrl+V.": "Trascina qui l'XML UBL di una fattura o nota di credito, oppure incollalo ovunque con Ctrl+V.",
    "Choose file": "Scegli file",
    "Paste text": "Incolla testo",
    "Clear": "Svuota",
    "XML input": "XML in ingresso",
    "Paste the XML here; it is read as soon as it's complete.": "Incolla qui l'XML; viene letto appena è completo.",
    "Attachments": "Allegati",
    "Raw XML": "XML originale",
    "Views": "Viste",
    "Reads like the invoice: who bills whom, the amount due, the lines and the totals, checked for you.":
      "Si legge come la fattura: chi fattura a chi, l'importo dovuto, le righe e i totali, già controllati.",
    "Every UBL field by section, with its EN 16931 business term (BT-xx) and decoded codes.":
      "Ogni campo UBL per sezione, con il termine EN 16931 (BT-xx) e i codici decodificati.",
    "Preview or download the PDFs and files embedded in the XML. Nothing leaves your browser.":
      "Visualizza o scarica i PDF e i file incorporati nell'XML. Nulla lascia il tuo browser.",
    "Filter fields…": "Filtra i campi…",
    "Filter fields": "Filtra i campi",
    "Show empty fields": "Mostra campi vuoti",
    "Theme: follow the device": "Tema: segui il dispositivo",
    "Theme: light": "Tema: chiaro",
    "Theme: dark": "Tema: scuro",
    "Tools": "Strumenti",
    "Filters": "Filtri",
    "Display": "Visualizza",
    "A field in this block is flagged": "Un campo di questo blocco è segnalato",
    "Fold passing blocks": "Comprimi i blocchi senza problemi",
    "Show passing rules": "Mostra anche le regole rispettate",
    "List the rules that pass as well, folded under the failed ones": "Elenca anche le regole rispettate, ripiegate sotto quelle non rispettate",
    "Next issue": "Prossimo problema",
    "E-report": "E-reporting", "The Flux 10 report built from this invoice. The envelope values are placeholders.": "Il report Flux 10 costruito da questa fattura. I valori della busta sono segnaposto.",
    "Issues": "Problemi", "Hide issues": "Nascondi i problemi", "Show all rules": "Mostra tutte le regole", "Show all {n} rules": "Mostra tutte le {n} regole",
    "+{n} more": "+{n} altri", "{n} errors": "{n} errori", "{n} error": "{n} errore",
    "Show BT numbers and XML paths": "Mostra numeri BT e percorsi XML", "Field documentation (Peppol BIS Billing 3.0)": "Documentazione del campo (Peppol BIS Billing 3.0)", "Code values: {list}": "Valori ammessi: {list}", "Raw values (as in XML)": "Valori grezzi (come nell'XML)",
    "Open an XML file or paste it. Nothing leaves your browser.": "Apri un file XML o incollalo. Nulla lascia il tuo browser.",
    "Previous issue": "Problema precedente",
    "Change the rule sets": "Cambia i gruppi di regole",
    "{n} fields": "{n} campi",
    "{n} field": "{n} campo",
    "Try a sample invoice": "Prova una fattura di esempio",
    "Checks a UBL invoice or credit note against the EN 16931 rules and, when the file asks for them, PEPPOL, France, Germany (XRechnung) and Italy, or the UAE (PINT AE) rules. Everything stays in your browser.": "Controlla una fattura o nota di credito UBL con le regole EN 16931 e, quando il file lo richiede, PEPPOL, Francia, Germania (XRechnung) e Italia, oppure le regole degli Emirati (PINT AE). Tutto resta nel tuo browser.",
    "Total": "Totale",
    "Exact values": "Valori esatti",
    "Document type": "Tipo documento",
    "Show XML tags": "Mostra tag XML",
    "Click ▾ to fold an element. Attachment data is shortened.": "Clicca ▾ per chiudere un elemento. I dati degli allegati sono abbreviati.",
    "Expand all": "Espandi tutto",
    "Collapse to sections": "Riduci alle sezioni",
    "Copy XML": "Copia XML",
    "Copied": "Copiato",
    "Copy failed": "Copia non riuscita",
    "Open in new tab": "Apri in una nuova scheda",
    "Download": "Scarica",
    "Close": "Chiudi",
    "Preview": "Anteprima",
    "Collapse all": "Comprimi tutto",

    // Loading
    "Pasted XML": "XML incollato",
    "Not valid XML.": "XML non valido.",
    "No UBL Invoice or CreditNote found.": "Nessuna Invoice o CreditNote UBL trovata.",
    "Root element is <{name}>.": "L'elemento radice è <{name}>.",
    "This is a CII (UN/CEFACT) invoice; this viewer reads UBL.": "Questa è una fattura CII (UN/CEFACT); questo visualizzatore legge UBL.",
    "credit note": "nota di credito",
    "invoice": "fattura",
    "removed {n} leading “-” from tags": "rimossi {n} “-” iniziali dai tag",
    "escaped {n} bare “&”": "convertiti {n} “&” non validi",
    "Couldn't read {name}.": "Impossibile leggere {name}.",
    "The clipboard is empty. Copy the XML first, then click Paste text.": "Gli appunti sono vuoti. Copia prima l'XML, poi clicca Incolla testo.",

    // Hero and facts
    "Credit note": "Nota di credito",
    "Invoice": "Fattura",
    "inside <{name}>": "dentro <{name}>",
    "(no number)": "(senza numero)",
    "From": "Da",
    "To": "A",
    "Unknown seller": "Venditore sconosciuto",
    "Unknown buyer": "Acquirente sconosciuto",
    "Amount credited": "Importo accreditato",
    "Transaction category (note #BAR#)": "Categoria della transazione (nota #BAR#)",
    "Amount due": "Importo dovuto",
    "Due": "Scadenza",
    "{n} days after issue": "{n} giorni dopo l'emissione",
    "✗ {bad} of {n} rules fail": "✗ {bad} regole su {n} non rispettate",
    "✓ {n} rules pass": "✓ {n} regole rispettate",
    "Invoicing period": "Periodo di fatturazione",
    "Purchase order": "Ordine d'acquisto",
    "Payment": "Pagamento",
    "Lines": "Righe",
    "Currency": "Valuta",

    // Overview
    "Identifier": "Identificativo",
    "Contact": "Contatto",
    "Notes": "Note",
    "Description": "Descrizione",
    "Quantity": "Quantità",
    "VAT": "IVA",
    "Amount": "Importo",
    "Allowances": "Sconti",
    "Charges": "Maggiorazioni",
    "Rounding": "Arrotondamento",
    "BIC": "BIC",
    "Remittance info": "Causale",
    "Card": "Carta",
    "Mandate": "Mandato",
    "Debited account": "Conto addebitato",
    "Terms": "Condizioni",
    "Due date": "Scadenza",
    "Sales order": "Ordine di vendita",
    "Buyer reference": "Riferimento acquirente",
    "Contract": "Contratto",
    "Project": "Progetto",
    "Preceding invoice": "Fattura precedente",
    "Despatch advice": "Documento di trasporto",
    "Receiving advice": "Avviso di ricevimento",
    "VAT point date": "Data di esigibilità IVA",
    "References": "Riferimenti",
    "Deliver to": "Consegna a",
    "Address": "Indirizzo",
    "Delivery": "Consegna",
    "Charge": "Maggiorazione",
    "Allowance": "Sconto",
    "This document has no embedded attachments.": "Questo documento non ha allegati incorporati.",
    "unknown type": "tipo sconosciuto",
    "Reference: {ref}": "Riferimento: {ref}",
    "Declared as PDF, but the content doesn't start with %PDF.": "Dichiarato come PDF, ma il contenuto non inizia con %PDF.",
    "This attachment isn't valid Base64, so it can't be opened.": "Questo allegato non è Base64 valido, quindi non si può aprire.",
    "This attachment isn't valid Base64, so it can't be saved.": "Questo allegato non è Base64 valido, quindi non si può salvare.",
    "Preview of {name}": "Anteprima di {name}",
    "No in-page preview for {type}. Use Download to open it.": "Nessuna anteprima per {type}. Usa Scarica per aprirlo.",
    "this file type": "questo tipo di file",
    "{n} characters of Base64 · open attachment": "{n} caratteri Base64 · apri allegato",
    "Fold {name}": "Chiudi {name}",
    "Expand": "Espandi",

    // All fields: sections, tables
    "Sections": "Sezioni",
    "Document": "Documento",
    "Parties": "Soggetti",
    "Delivery & payment": "Consegna e pagamento",
    "Amounts": "Importi",
    "More": "Altro",
    "Preceding invoices": "Fatture precedenti",
    "Invoice reference": "Riferimento fattura",
    "Invoice note": "Nota della fattura",
    "Invoiced object {n}": "Oggetto fatturato {n}",
    "Supporting document {n}": "Documento allegato {n}",
    "Supporting document": "Documento allegato",
    "Supporting documents": "Documenti allegati",
    "Seller": "Venditore",
    "Buyer": "Acquirente",
    "Payee": "Beneficiario",
    "Seller tax representative": "Rappresentante fiscale del venditore",
    "Payment means": "Mezzo di pagamento",
    "Payment means {n}": "Mezzo di pagamento {n}",
    "Payment terms {n}": "Condizioni di pagamento {n}",
    "Prepaid payment {n}": "Pagamento anticipato {n}",
    "Allowance {n}": "Sconto {n}",
    "Charge {n}": "Maggiorazione {n}",
    "of {amount}": "di {amount}",
    "Converted": "Convertito",
    "Download XML": "Scarica XML",
    "Converted to XML": "Convertito in XML",
    "first of {n} invoices": "la prima di {n} fatture",
    "Not placed in the XML": "Non inseriti nell'XML",
    "Source field": "Campo di origine",
    "Value": "Valore",
    "Why": "Motivo",
    "Not applied: the selected rule set has its own model and rules": "Non applicato: il set di regole scelto ha un proprio modello e proprie regole",
    "Every field with a value was placed.": "Ogni campo con un valore è stato inserito.",
    "Placed by reading the field name": "Inseriti in base al nome del campo",
    "Could not read the document.": "Impossibile leggere il documento.",

    "VAT total in accounting currency": "Totale IVA nella valuta di contabilizzazione",
    "Invoice total VAT amount": "Importo totale IVA della fattura",
    "Category": "Categoria",
    "Rate": "Aliquota",
    "Taxable": "Imponibile",
    "Exemption reason": "Motivo di esenzione",
    "Tax total {n}": "Totale imposte {n}",
    "Totals": "Totali",
    "Checks": "Controlli",
    "{n} failing": "{n} non rispettate",
    "{n} warning": "{n} avviso",
    "{n} warnings": "{n} avvisi",
    "all pass": "tutte rispettate",
    "Line": "Riga",
    "Item": "Articolo",
    "Net price": "Prezzo netto",
    "Net amount": "Importo netto",
    "✗ {n} error": "✗ {n} errore",
    "✗ {n} errors": "✗ {n} errori",
    "{n} with errors": "{n} con errori",
    "Other elements": "Altri elementi",
    "More fields": "Altri campi",
    "Not present in this document.": "Non presente in questo documento.",
    "(group)": "(gruppo)",
    "(empty)": "(vuoto)",
    "Subject code (BT-21)": "Codice argomento (BT-21)",
    "Payment means text (BT-82)": "Testo mezzo di pagamento (BT-82)",
    "Unit of measure": "Unità di misura",
    "Total allowances": "Totale sconti",
    "Total charges": "Totale maggiorazioni",
    "Line net amount": "Importo netto di riga",
    "Quantity × net price": "Quantità × prezzo netto",
    "Quantity × net price / base quantity": "Quantità × prezzo netto / quantità base",
    "= Calculated": "= Calcolato",
    "Line net amount in the file": "Importo netto di riga nel file",
    "off by {amount}": "differenza {amount}",

    // Checks card
    "Rule sets": "Set di regole",
    "detected": "rilevato",
    "PEPPOL BIS Billing 3.0": "PEPPOL BIS Billing 3.0",
    "France (CTC e-invoicing)": "Francia (fatturazione elettronica CTC)",
    "{n} rules pass": "{n} regole rispettate",
    "1 rule passes": "1 regola rispettata",
    "Show where it fails": "Mostra dove non è rispettata",
    "How to fix": "Come correggere", "Official list": "Elenco ufficiale", "ISO 4217 currency codes": "Codici valuta ISO 4217", "ISO 3166-1 country codes": "Codici paese ISO 3166-1", "UN/ECE Rec 20 unit codes": "Codici unità di misura UN/ECE Rec 20", "UNCL 1001 document type codes": "Codici tipo documento UNCL 1001", "UNCL 4461 payment means codes": "Codici mezzo di pagamento UNCL 4461", "UNCL 5305 VAT category codes": "Codici categoria IVA UNCL 5305", "UNCL 5189 allowance reason codes": "Codici motivo sconto UNCL 5189", "UNCL 7161 charge reason codes": "Codici motivo addebito UNCL 7161", "UNCL 2005 period codes": "Codici periodo UNCL 2005", "UNCL 1153 reference qualifier codes": "Codici qualificatore di riferimento UNCL 1153", "UNCL 7143 classification codes": "Codici di classificazione UNCL 7143", "ISO 6523 ICD identifier schemes": "Schemi identificativi ISO 6523 ICD", "EAS electronic address schemes": "Schemi di indirizzo elettronico EAS", "VATEX exemption reason codes": "Codici motivo esenzione VATEX", "Allowed MIME types": "Tipi MIME ammessi",
    "Where each field went": "Dove è finito ogni campo", "{n} more fields were placed, but their element is not traced here.": "Altri {n} campi sono stati inseriti, ma qui non si vede in quale elemento.", "XML element": "Elemento XML", "assumed": "ipotesi",
    "Download report": "Scarica report", "Checks done": "Controlli completati", "missing": "mancante", "Page {n} of {m}": "Pagina {n} di {m}", "Check report": "Report del controllo", "Result": "Esito", "Error": "Errore", "Warning": "Avviso", "No rule fails.": "Nessuna regola non rispettata.",
    "Files": "File", "{n} files": "{n} file", "Success": "Riuscito", "Not readable": "Non leggibile", "Checking…": "Controllo…", "Copy results": "Copia risultati", "Copied": "Copiato",
    "{n} succeeded": "{n} riusciti", "{n} with errors": "{n} con errori", "{n} with warnings only": "{n} solo con avvisi", "{n} not readable": "{n} non leggibili",
    "Checking {done} of {total}…": "Controllo {done} di {total}…", "Empty file.": "File vuoto.",
    "Checking the rules…": "Controllo delle regole…",
    "The rules could not be run on this document": "Non è stato possibile eseguire le regole su questo documento",
    "Fails {ids}": "Non rispettate: {ids}",
    "Missing": "Mancante",
    "Required field": "Campo obbligatorio",
    "Warning {ids}": "Avviso: {ids}",
    "No rule fails here": "Nessuna regola violata qui",

    // ---------- Field labels ----------
    "Document number": "Numero documento",
    "Issue date": "Data di emissione",
    "Issue time": "Ora di emissione",
    "Invoice type code": "Codice tipo fattura",
    "Credit note type code": "Codice tipo nota di credito",
    "Payment due date": "Data di scadenza del pagamento",
    "Invoice currency": "Valuta della fattura",
    "VAT accounting currency": "Valuta di contabilizzazione IVA",
    "Buyer accounting reference": "Riferimento contabile acquirente",
    "Business process type": "Tipo di processo commerciale",
    "Specification identifier": "Identificativo della specifica",
    "UBL version": "Versione UBL",
    "Project reference": "Riferimento progetto",
    "Contract reference": "Riferimento contratto",
    "Purchase order reference": "Riferimento ordine d'acquisto",
    "Sales order reference": "Riferimento ordine di vendita",
    "Receiving advice reference": "Riferimento avviso di ricevimento",
    "Despatch advice reference": "Riferimento documento di trasporto",
    "Tender or lot reference": "Riferimento gara o lotto",
    "Invoicing period start": "Inizio periodo di fatturazione",
    "Invoicing period end": "Fine periodo di fatturazione",
    "VAT point date code": "Codice data di esigibilità IVA",
    "Document identifier": "Identificativo documento",
    "Document type code": "Codice tipo documento",
    "External document location": "Posizione del documento esterno",
    "Attached document": "Documento allegato",
    "Legal name": "Ragione sociale",
    "Trading name": "Nome commerciale",
    "Party identifier": "Identificativo soggetto",
    "Legal registration identifier": "Identificativo di registrazione legale",
    "VAT / tax registration identifier": "Partita IVA / identificativo fiscale",
    "Tax scheme": "Schema fiscale",
    "Additional legal information": "Informazioni legali aggiuntive",
    "Electronic address": "Indirizzo elettronico",
    "Address line 1": "Indirizzo riga 1",
    "Address line 2": "Indirizzo riga 2",
    "Address line 3": "Indirizzo riga 3",
    "City": "Città",
    "Post code": "CAP",
    "Country subdivision": "Provincia / regione",
    "Country": "Paese",
    "Contact point": "Referente",
    "Contact telephone": "Telefono referente",
    "Contact email": "Email referente",
    "Deliver to party name": "Nome del destinatario della consegna",
    "Deliver to location identifier": "Identificativo luogo di consegna",
    "Actual delivery date": "Data effettiva di consegna",
    "Deliver to address line 1": "Indirizzo di consegna riga 1",
    "Deliver to address line 2": "Indirizzo di consegna riga 2",
    "Deliver to address line 3": "Indirizzo di consegna riga 3",
    "Deliver to city": "Città di consegna",
    "Deliver to post code": "CAP di consegna",
    "Deliver to country subdivision": "Provincia / regione di consegna",
    "Deliver to country": "Paese di consegna",
    "Payment means type": "Tipo di mezzo di pagamento",
    "Remittance information": "Causale di pagamento",
    "Payment account (IBAN)": "Conto di pagamento (IBAN)",
    "Payment account name": "Intestatario del conto",
    "Payment service provider (BIC)": "Prestatore di servizi di pagamento (BIC)",
    "Card number (last digits)": "Numero carta (ultime cifre)",
    "Card network": "Circuito carta",
    "Card holder name": "Titolare della carta",
    "Mandate reference": "Riferimento mandato",
    "Payment terms": "Condizioni di pagamento",
    "Type": "Tipo",
    "Reason code": "Codice motivo",
    "Reason": "Motivo",
    "Percentage": "Percentuale",
    "Base amount": "Importo base",
    "VAT category": "Categoria IVA",
    "VAT rate": "Aliquota IVA",
    "Sum of allowances": "Somma degli sconti",
    "Sum of charges": "Somma delle maggiorazioni",
    "Total without VAT": "Totale senza IVA",
    "Total with VAT": "Totale con IVA",
    "Paid amount": "Importo pagato",
    "Rounding amount": "Importo di arrotondamento",
    "Amount due for payment": "Importo da pagare",
    "Line identifier": "Identificativo riga",
    "Line note": "Nota di riga",
    "Invoiced object identifier": "Identificativo oggetto fatturato",
    "Invoiced quantity": "Quantità fatturata",
    "Credited quantity": "Quantità accreditata",
    "Referenced purchase order line": "Riga dell'ordine d'acquisto di riferimento",
    "Purchase order (line level)": "Ordine d'acquisto (livello riga)",
    "Line period start": "Inizio periodo di riga",
    "Line period end": "Fine periodo di riga",
    "Item net price": "Prezzo netto articolo",
    "Item price discount": "Sconto sul prezzo articolo",
    "Item gross price": "Prezzo lordo articolo",
    "Price discount indicator": "Indicatore sconto sul prezzo",
    "Item price base quantity": "Quantità base del prezzo",
    "Item name": "Nome articolo",
    "Item description": "Descrizione articolo",
    "Seller's item identifier": "Codice articolo del venditore",
    "Buyer's item identifier": "Codice articolo dell'acquirente",
    "Item standard identifier": "Identificativo standard articolo",
    "Item classification": "Classificazione articolo",
    "Item country of origin": "Paese di origine articolo",
    "Item attribute": "Attributo articolo",
    "Credit note number": "Numero nota di credito",
    "Invoice number": "Numero fattura",

    // ---------- Code lists ----------
    "Request for payment": "Richiesta di pagamento",
    "Debit note related to goods or services": "Nota di debito relativa a beni o servizi",
    "Metered services invoice": "Fattura per servizi a consumo",
    "Debit note related to financial adjustments": "Nota di debito per rettifiche finanziarie",
    "Self-billed credit note": "Nota di credito in autofatturazione",
    "Consolidated credit note": "Nota di credito riepilogativa",
    "Credit note for price variation": "Nota di credito per variazione di prezzo",
    "Delcredere credit note": "Nota di credito del credere",
    "Proforma invoice": "Fattura proforma",
    "Partial invoice": "Fattura parziale",
    "Commercial invoice": "Fattura commerciale",
    "Debit note": "Nota di debito",
    "Corrected invoice": "Fattura rettificativa",
    "Consolidated invoice": "Fattura riepilogativa",
    "Prepayment invoice": "Fattura di acconto",
    "Hire invoice": "Fattura di noleggio",
    "Tax invoice": "Fattura fiscale",
    "Self-billed invoice": "Autofattura",
    "Delcredere invoice": "Fattura del credere",
    "Factored invoice": "Fattura ceduta (factoring)",
    "Lease invoice": "Fattura di leasing",
    "Consignment invoice": "Fattura di conto deposito",
    "Factored credit note": "Nota di credito ceduta (factoring)",
    "Self-billed debit note": "Nota di debito in autofatturazione",
    "Forwarder's credit note": "Nota di credito dello spedizioniere",
    "Insurer's invoice": "Fattura dell'assicuratore",
    "Forwarder's invoice": "Fattura dello spedizioniere",
    "Port charges document": "Documento diritti portuali",
    "Invoice information for accounting purposes": "Informazioni di fattura a fini contabili",
    "Freight invoice": "Fattura di trasporto",
    "Consular invoice": "Fattura consolare",
    "Partial construction invoice": "Fattura parziale lavori",
    "Partial final construction invoice": "Fattura parziale finale lavori",
    "Final construction invoice": "Fattura finale lavori",
    "Customs invoice": "Fattura doganale",
    "Instrument not defined": "Strumento non definito",
    "In cash": "Contanti",
    "Cheque": "Assegno",
    "Credit transfer": "Bonifico",
    "Debit transfer": "Addebito",
    "Payment to bank account": "Pagamento su conto bancario",
    "Bank card": "Carta bancaria",
    "Direct debit": "Addebito diretto",
    "Credit card": "Carta di credito",
    "Debit card": "Carta di debito",
    "Standing agreement": "Accordo permanente",
    "SEPA credit transfer": "Bonifico SEPA",
    "SEPA direct debit": "Addebito diretto SEPA",
    "Online payment service": "Servizio di pagamento online",
    "Clearing between partners": "Compensazione tra le parti",
    "Mutually defined": "Definito tra le parti",
    "Standard rate": "Aliquota ordinaria",
    "Zero rated": "Aliquota zero",
    "Exempt from tax": "Esente",
    "VAT reverse charge": "Inversione contabile (reverse charge)",
    "Intra-community supply (VAT exempt)": "Cessione intracomunitaria (esente IVA)",
    "Export outside the EU (tax not charged)": "Esportazione fuori UE (non imponibile)",
    "Outside the scope of VAT": "Fuori campo IVA",
    "Canary Islands (IGIC)": "Isole Canarie (IGIC)",
    "Ceuta and Melilla (IPSI)": "Ceuta e Melilla (IPSI)",
    "Transferred VAT (Italy)": "Scissione dei pagamenti (Italia)",
    "Intra-community supply": "Cessione intracomunitaria",
    "Export outside the EU": "Esportazione fuori UE",
    "Invoice issue date": "Data di emissione della fattura",
    "Paid to date": "Data di pagamento",
    "Bonus for works ahead of schedule": "Premio per lavori in anticipo",
    "Other bonus": "Altro premio",
    "Manufacturer's consumer discount": "Sconto del produttore al consumatore",
    "Due to military status": "Per status militare",
    "Due to work accident": "Per infortunio sul lavoro",
    "Special agreement": "Accordo speciale",
    "Production error discount": "Sconto per errore di produzione",
    "New outlet discount": "Sconto nuovo punto vendita",
    "Sample discount": "Sconto campione",
    "End-of-range discount": "Sconto fine serie",
    "Incoterm discount": "Sconto Incoterm",
    "Point of sales threshold allowance": "Sconto soglia punto vendita",
    "Material surcharge/deduction": "Supplemento/detrazione materiale",
    "Discount": "Sconto",
    "Special rebate": "Abbuono speciale",
    "Fixed long term": "Fisso a lungo termine",
    "Temporary": "Temporaneo",
    "Standard": "Standard",
    "Yearly turnover": "Fatturato annuo",
    "Advertising": "Pubblicità",
    "Additional packaging": "Imballaggio aggiuntivo",
    "Other services": "Altri servizi",
    "Freight service": "Servizio di trasporto",
    "Financing": "Finanziamento",
    "Labelling": "Etichettatura",
    "Packing": "Imballaggio",
    "General information": "Informazioni generali",
    "Terms of payments": "Condizioni di pagamento",
    "Payment information": "Informazioni di pagamento",
    "Payment detail / remittance information": "Dettagli di pagamento / causale",
    "Supplier remarks": "Note del fornitore",
    "Regulatory information": "Informazioni normative",
    "Government information": "Informazioni governative",
    "Tax declaration": "Dichiarazione fiscale",
    "Customs declaration information": "Informazioni doganali",
    "Price conditions": "Condizioni di prezzo",
    "one": "uno", "piece": "pezzo", "each": "cadauno", "unit": "unità", "hour": "ora", "day": "giorno", "week": "settimana",
    "month": "mese", "year": "anno", "minute": "minuto", "kilogram": "chilogrammo", "gram": "grammo", "tonne": "tonnellata",
    "metre": "metro", "kilometre": "chilometro", "square metre": "metro quadrato", "cubic metre": "metro cubo", "litre": "litro",
    "kilowatt hour": "chilowattora", "set": "set", "pair": "paio", "lump sum": "forfait", "service unit": "unità di servizio",
    "mutually defined": "definito tra le parti",
    "SE organisation number": "Numero organizzazione SE", "NO organisation number": "Numero organizzazione NO",
    "FI organisation ID": "ID organizzazione FI", "EU Commission directorates": "Direzioni della Commissione UE",
    "FR CTC routing code": "Codice di instradamento CTC FR", "FR CTC electronic address": "Indirizzo elettronico CTC FR",
    "SEPA creditor ID": "ID creditore SEPA", "IT iPA code": "Codice iPA",

    // ---------- Check messages: EN 16931 ----------
    "Paid amount (BT-113)": "Importo pagato (BT-113)",
    "Rounding amount (BT-114)": "Importo di arrotondamento (BT-114)",
    "lines": "righe",

    // ---------- Check messages: consistency (CHK-) ----------
    "Due date (BT-9)": "La data di scadenza (BT-9)",
    "Issue date (BT-2) should not be in the future": "La data di emissione (BT-2) non dovrebbe essere nel futuro",
    "Invoicing period (BG-14) should not start after the issue date": "Il periodo di fatturazione (BG-14) non dovrebbe iniziare dopo la data di emissione",
    "The credit note should refer to the invoice it corrects (BT-25)": "La nota di credito dovrebbe indicare la fattura che rettifica (BT-25)",
    "Line identifiers (BT-126) must be unique": "Gli identificativi di riga (BT-126) devono essere univoci",
    "Lines with quantity 0 should have no net amount": "Le righe con quantità 0 non dovrebbero avere importo netto",
    "Each VAT category and rate must have only one VAT breakdown": "Ogni categoria e aliquota IVA deve avere un solo riepilogo IVA",
    "Each VAT category and rate used on lines, allowances or charges must have a VAT breakdown": "Ogni categoria e aliquota IVA usata in righe, sconti o maggiorazioni deve avere un riepilogo IVA",
    "VAT rates should be between 0 and 30 %": "Le aliquote IVA dovrebbero essere tra 0 e 30 %",
    "VAT exemption reason codes (BT-121) should match their VAT category (AE→AE, D/F/I/J→E, G→G, IC→K, O→O)": "I codici motivo di esenzione IVA (BT-121) dovrebbero corrispondere alla loro categoria IVA (AE→AE, D/F/I/J→E, G→G, IC→K, O→O)",
    "VATEX codes belong in the exemption reason code (BT-121), not the reason text (BT-120)": "I codici VATEX vanno nel codice motivo di esenzione (BT-121), non nel testo del motivo (BT-120)",
    "Paid amount (BT-113) should not exceed the total with VAT (BT-112)": "L'importo pagato (BT-113) non dovrebbe superare il totale con IVA (BT-112)",
    "Rounding amount (BT-114) should be less than 1": "L'importo di arrotondamento (BT-114) dovrebbe essere inferiore a 1",
    "Seller and buyer should have different VAT IDs": "Venditore e acquirente dovrebbero avere partite IVA diverse",
    "VAT IDs should start with the country of the party’s address": "Le partite IVA dovrebbero iniziare con il paese dell'indirizzo del soggetto",
    "E-mail addresses must be well formed": "Gli indirizzi e-mail devono essere ben formati",
    "IBANs (BT-84) must have a valid length and check digits": "Gli IBAN (BT-84) devono avere lunghezza e cifre di controllo valide",
    "BIC codes (BT-86) must be 8 or 11 characters (bank, country, location, branch)": "I codici BIC (BT-86) devono avere 8 o 11 caratteri (banca, paese, località, filiale)",
    "Credit notes normally use the CreditNote document": "Le note di credito usano normalmente il documento CreditNote",
    "No preceding invoice": "Nessuna fattura precedente",

    // ---------- Check messages: PEPPOL ----------

    // ---------- Check messages: France (official BR-FR) ----------

    // ---------- Check messages: France (this tool's own warnings) ----------
    "SIREN numbers should have a valid check digit": "I numeri SIREN dovrebbero avere una cifra di controllo valida",
    "SIRET numbers should have a valid check digit": "I numeri SIRET dovrebbero avere una cifra di controllo valida",
    "Seller VAT ID (BT-31) should be given (except under the VAT franchise)": "La partita IVA del venditore (BT-31) dovrebbe essere indicata (salvo franchigia IVA)",
    "French VAT IDs should be FR + a valid 2-character key + the 9-digit SIREN": "Le partite IVA francesi dovrebbero essere FR + una chiave valida di 2 caratteri + il SIREN di 9 cifre",
    "Seller address should have street, city and post code (legal mention)": "L'indirizzo del venditore dovrebbe avere via, città e CAP (menzione obbligatoria)",
    "Buyer address should have street, city and post code (legal mention)": "L'indirizzo dell'acquirente dovrebbe avere via, città e CAP (menzione obbligatoria)",
    "Seller VAT ID should contain the seller SIREN": "La partita IVA del venditore dovrebbe contenere il SIREN del venditore",
    "Delivery date (BT-72) or invoicing period (BG-14) should be given (date of the sale or service)": "Dovrebbe essere indicata la data di consegna (BT-72) o il periodo di fatturazione (BG-14) (data della vendita o del servizio)",
  };

  // ---------- Italian: patterns for messages built from data ----------
  // {name} captures any text; the captured parts are translated again (category names, line names …).
  // A pattern "text with {name}" and its Italian becomes { re, names, it }
  const compile = ([en, it]) => {
    const names = [];
    const re = new RegExp("^" + en.split(/(\{\w+\})/).map((part) => {
      const m = /^\{(\w+)\}$/.exec(part);
      if (m) { names.push(m[1]); return m[1][0] === "_" ? "(.*?)" : "(.+?)"; }   // {_x}: a value left as written, it may be empty
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("") + "$");
    return { re, names, it };
  };
  const IT_PATTERNS = [
    ["{a}: VAT amount must be 0 at a 0 % rate", "{a}: l'importo IVA deve essere 0 con aliquota 0 %"],
    ["{a}: VAT amount must equal taxable amount × rate", "{a}: l'importo IVA deve essere uguale a imponibile × aliquota"],
    ["{a} is used, so it must have exactly one VAT breakdown", "{a} è usata, quindi deve avere esattamente un riepilogo IVA"],
    ["{a} is used, so it must have a VAT breakdown", "{a} è usata, quindi deve avere un riepilogo IVA"],
    ["With {a} in {b}, {c}", "Con {a} in {b}, {c}"],
    ["Lines in {a}: {b}", "Righe in {a}: {b}"],
    ["Document allowances in {a}: {b}", "Sconti a livello documento in {a}: {b}"],
    ["Document charges in {a}: {b}", "Maggiorazioni a livello documento in {a}: {b}"],
    ["Taxable amount in {a} must equal its lines + charges − allowances", "L'imponibile in {a} deve essere uguale a righe + maggiorazioni − sconti"],
    ["Taxable amount in {a} at {b} % must equal lines + charges − allowances at that rate", "L'imponibile in {a} al {b} % deve essere uguale a righe + maggiorazioni − sconti a quell'aliquota"],
    ["No line, allowance or charge is in {a} at {b} %, yet the breakdown taxes {c}", "Nessuna riga, sconto o maggiorazione è in {a} al {b} %, ma il riepilogo tassa {c}"],
    ["VAT amount in {a} must be 0", "L'importo IVA in {a} deve essere 0"],
    ["VAT amount in {a} at {b} % must equal taxable amount × rate", "L'importo IVA in {a} al {b} % deve essere uguale a imponibile × aliquota"],
    ["VAT breakdown in {a} must have an exemption reason (BT-120) or code (BT-121)", "Il riepilogo IVA in {a} deve avere un motivo (BT-120) o codice (BT-121) di esenzione"],
    ["VAT breakdown in {a} must not have an exemption reason (BT-120/BT-121)", "Il riepilogo IVA in {a} non deve avere un motivo di esenzione (BT-120/BT-121)"],
    ["{a} must have at most 2 decimals", "{a}: al massimo 2 decimali"],
    ["{a}: amount must equal base × percentage", "{a}: l'importo deve essere uguale a base × percentuale"],
    ["{a}: amount must equal base amount × percentage", "{a}: l'importo deve essere uguale a importo base × percentuale"],
    ["{a}: net price must equal gross price − price discount", "{a}: il prezzo netto deve essere uguale a prezzo lordo − sconto sul prezzo"],
    ["{a}: net amount must equal quantity × net price / base quantity + charges − allowances", "{a}: l'importo netto deve essere uguale a quantità × prezzo netto / quantità base + maggiorazioni − sconti"],
    ["{a} must not be before the issue date (BT-2)", "{a} non deve essere precedente alla data di emissione (BT-2)"],
    ["due date {a} is before the issue date {b}", "la scadenza {a} è precedente alla data di emissione {b}"],
    ["due date {a}, issue date {b}", "scadenza {a}, data di emissione {b}"],
    ["Preceding invoices (BT-26) must not be dated after this document ({a})", "Le fatture precedenti (BT-26) non devono avere data successiva a questo documento ({a})"],
    ["Line periods (BG-26) should fall inside the invoicing period ({a} to {b})", "I periodi di riga (BG-26) dovrebbero rientrare nel periodo di fatturazione (dal {a} al {b})"],
    ["A credit note type code ({a}) should not be used in an Invoice document", "Un codice tipo nota di credito ({a}) non dovrebbe essere usato in un documento Invoice"],
    ["All amounts must be in the document currency ({a})", "Tutti gli importi devono essere nella valuta del documento ({a})"],
    ["Note #{a}# must state the {b}", "La nota #{a}# deve indicare {b}"],
    ["{a} ({b})", "{a} ({b})"]
  ].map(compile);

  // Words and short phrases inside details and item names ("Fails on line 2", "lines (line 1 100.00) …").
  // Longer phrases are listed first so they win over the words they contain.
  const IT_WORDS = [
    [/\band (\d+) more\b/g, "e altri $1"],
    [/\+ (\d+) more\b/g, "+ altri $1"],
    ["Fails on", "Non rispettata da"], ["Repeated:", "Ripetuti:"], ["Found", "Trovati"], ["Empty:", "Vuoti:"], ["Used:", "Usate:"],
    ["No breakdown for", "Nessun riepilogo per"], ["with category", "con categoria"], ["Given as", "Indicato come"], ["(fine for an advance invoice)", "(corretto per una fattura di acconto)"],
    ["period starts", "il periodo inizia"], ["(none)", "(nessuno)"], ["found", "trovati"], ["notes", "note"],
    ["off by", "differenza"], ["missing", "mancante"],
    ["Standard rate", "Aliquota ordinaria"], ["Zero rated", "Aliquota zero"], ["Exempt from tax", "Esente"],
    ["VAT reverse charge", "Inversione contabile"], ["Intra-community supply", "Cessione intracomunitaria"],
    ["Export outside the EU", "Esportazione fuori UE"], ["Not subject to VAT", "Non soggetto a IVA"],
    ["Canary Islands", "Isole Canarie"], ["Ceuta and Melilla", "Ceuta e Melilla"], ["Split payment (Italy)", "Scissione dei pagamenti (Italia)"],
    ["VAT breakdown", "riepilogo IVA"], ["preceding invoice", "fattura precedente"], ["supporting document", "documento allegato"],
    ["deliver-to address", "indirizzo di consegna"], ["item attribute", "attributo articolo"], ["payment means", "mezzo di pagamento"],
    ["tax representative", "rappresentante fiscale"], ["direct debit", "addebito diretto"],
    ["base qty", "qtà base"], ["qty", "qtà"], ["price", "prezzo"], ["gross", "lordo"], ["discount", "sconto"],
    ["lines", "righe"], ["line", "riga"], ["allowances", "sconti"], ["allowance", "sconto"], ["charges", "maggiorazioni"], ["charge", "maggiorazione"],
    ["seller service provider", "fornitore di servizi del venditore"], ["buyer service provider", "fornitore di servizi dell'acquirente"],
    ["seller agent", "agente del venditore"], ["buyer agent", "agente dell'acquirente"], ["deliver-to location", "luogo di consegna"],
    ["deliver-to", "consegna"], ["payee", "beneficiario"], ["payer", "pagatore"], ["no scheme", "nessuno schema"], ["(empty)", "(vuoto)"],
    ["due date", "scadenza"], ["category", "categoria"], ["rate", "aliquota"], ["attribute", "attributo"],
    ["seller", "venditore"], ["buyer", "acquirente"], ["scheme", "schema"], ["card", "carta"],
    ["amount", "importo"], ["paid", "pagato"], ["total", "totale"], ["due", "scadenza"], ["issued", "emessa"], ["today", "oggi"]
  ].map(([from, to]) => [typeof from === "string" ? new RegExp("(^|[^\\p{L}])" + from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\p{L}])", "gu") : from,
    typeof from === "string" ? "$1" + to : to]);

  // ---------- Italian: UBL syntax rules (UBL-CR, UBL-DT, UBL-SR) and code list messages ----------
  IT_PATTERNS.push(...[
    ["A UBL invoice should not include the {_a}", "Una fattura UBL non dovrebbe includere {_a}"],
    ["A UBL invoice should not include {_a}", "Una fattura UBL non dovrebbe includere {_a}"],
    ["A UBL invoice shall not include the {_a}", "Una fattura UBL non deve includere {_a}"],
    ["A UBL credit note should not include the {_a}", "Una nota di credito UBL non dovrebbe includere {_a}"]
  ].map(compile));
  const SR_ONCE = {
    "Contract identifier": "L'identificativo del contratto", "Receive advice identifier": "L'identificativo dell'avviso di ricevimento",
    "Despatch advice identifier": "L'identificativo dell'avviso di spedizione", "Invoice object identifier": "L'identificativo dell'oggetto fatturato",
    "Payment terms": "Le condizioni di pagamento", "Preceding invoice reference": "Il riferimento alla fattura precedente", "Invoice period": "Il periodo di fatturazione",
    "Seller name": "Il nome del venditore", "Seller trader name": "La denominazione commerciale del venditore",
    "Seller legal registration identifier": "L'identificativo di registrazione legale del venditore", "Seller VAT identifier": "La partita IVA del venditore",
    "Seller tax registration": "L'identificativo fiscale del venditore", "Seller additional legal information": "Le informazioni legali aggiuntive del venditore",
    "Buyer name": "Il nome dell'acquirente", "Buyer identifier": "L'identificativo dell'acquirente", "Buyer legal registration identifier": "L'identificativo di registrazione legale dell'acquirente",
    "Buyer VAT identifier": "La partita IVA dell'acquirente", "Buyer trade name": "La denominazione commerciale dell'acquirente",
    "Deliver to information": "Le informazioni di consegna", "Deliver to party name": "Il nome del destinatario della consegna", "Payment reference": "Il riferimento di pagamento",
    "Payment means text": "Il testo del mezzo di pagamento", "Mandate reference identifier": "Il riferimento del mandato", "Bank creditor reference": "Il riferimento del creditore bancario",
    "Project reference": "Il riferimento di progetto", "Due Date": "La data di scadenza", "Value tax point date": "La data di esigibilità IVA",
    "Supporting document description": "La descrizione del documento allegato", "VAT exemption reason text": "Il testo del motivo di esenzione IVA",
    "Item description": "La descrizione dell'articolo", "Document reference": "Il riferimento documentale"
  };
  Object.keys(SR_ONCE).forEach((en) => {
    IT[en + " shall occur maximum once"] = SR_ONCE[en] + " può comparire al massimo una volta";
    IT[en + " shall occur maximum once."] = SR_ONCE[en] + " può comparire al massimo una volta.";
  });
  [["Payee name", "Il nome del beneficiario"], ["Payee identifier", "L'identificativo del beneficiario"], ["Payee legal registration identifier", "L'identificativo di registrazione legale del beneficiario"]]
    .forEach(([en, it]) => { IT[en + " shall occur maximum once, if the Payee is different from the Seller"] = it + " può comparire al massimo una volta, se il beneficiario è diverso dal venditore"; });
  const DT_ATTR = { "Scheme name": "schemeName", "Scheme agency name": "schemeAgencyName", "Scheme data uri": "schemeDataURI", "Scheme uri": "schemeURI", "Format": "format",
    "Unit code list identifier": "unitCodeListIdentifier", "Unit code list agency identifier": "unitCodeListAgencyIdentifier", "Unit code list agency name": "unitCodeListAgencyName",
    "List agency name": "listAgencyName", "List name": "listName", "Name": "name", "Language identifier": "languageID", "List uri": "listURI", "List scheme uri": "listSchemeURI",
    "Language local identifier": "languageLocaleID", "Uri": "uri", "CharacterSetCode": "characterSetCode", "EncodingCode": "encodingCode", "Scheme Agency ID": "schemeAgencyID", "List Agency ID": "listAgencyID" };
  Object.keys(DT_ATTR).forEach((en) => { IT[en + " attribute should not be present"] = "L'attributo " + DT_ATTR[en] + " non dovrebbe essere presente"; });
  Object.assign(IT, {
    "Currency code list version id should not be present": "L'attributo currencyCodeListVersionID non dovrebbe essere presente",
    "Amounts shall be decimal up to two fraction digits": "Gli importi devono avere al massimo due decimali",
    "Binary object elements shall contain the mime code attribute": "Gli oggetti binari devono avere l'attributo mimeCode",
    "Binary object elements shall contain the file name attribute": "Gli oggetti binari devono avere l'attributo filename",
    "A UBL invoice shall not include an AdditionalDocumentReference simultaneously referring an Invoice Object Identifier and an Attachment": "Una fattura UBL non deve avere un AdditionalDocumentReference che indica insieme un identificativo dell'oggetto fatturato e un allegato",
    "A UBL invoice shall not include an AdditionalDocumentReference simultaneously referring an Invoice Object Identifier and an Document Description": "Una fattura UBL non deve avere un AdditionalDocumentReference che indica insieme un identificativo dell'oggetto fatturato e una descrizione del documento",
    "Scheme identifier shall only be used for invoiced object (document type code with value 130 or 50)": "L'identificativo dello schema può essere usato solo per l'oggetto fatturato (tipo documento 130 o 50)",
    "Document reference shall occur maximum once": "Il riferimento documentale può comparire al massimo una volta",
    "PartyLegalEntity shall occur maximum once within a Party.": "PartyLegalEntity può comparire al massimo una volta in una parte.",
    "An Invoice may only have one unique PaymentID, but the PaymentID may be used for multiple PaymentMeans": "Una fattura può avere un solo PaymentID, che può però essere usato in più mezzi di pagamento",
    "A Financial Institution Branch shall contain exactly one Payment account identifier (BT-84).": "Una filiale dell'istituto finanziario deve contenere esattamente un identificativo del conto di pagamento (BT-84).",
    "A Financial Institution Branch shall contain exactly one Payment service provider identifier (BT-86).": "Una filiale dell'istituto finanziario deve contenere esattamente un identificativo del prestatore di servizi di pagamento (BT-86).",
    " CompanyID (VAT Identifier) must be stated when providing the PartyTaxScheme/TaxScheme/ID.": "CompanyID (partita IVA) deve essere indicato quando si indica PartyTaxScheme/TaxScheme/ID.",
    "An Invoice shall contain maximum one Payment Card account (BG-18).": "Una fattura può contenere al massimo un conto di carta di pagamento (BG-18).",
    "An Invoice shall contain maximum one Payment Mandate (BG-19).": "Una fattura può contenere al massimo un mandato di pagamento (BG-19).",
    "An Invoice shall contain maximum one Originator document reference identifier (BT-17).": "Una fattura può contenere al massimo un identificativo del documento di origine (BT-17).",
    "Unit codes (BT-130, BT-150) must be UN/ECE Recommendation 20 or 21 codes": "I codici unità (BT-130, BT-150) devono essere codici UN/ECE Recommendation 20 o 21",
    "A date must be written YYYY-MM-DD": "Una data deve essere scritta AAAA-MM-GG",
    "Amount currencies must be ISO 4217 codes": "Le valute degli importi devono essere codici ISO 4217",
    "Item country of origin codes (BT-159) must be ISO 3166-1 alpha-2 codes": "I codici del paese di origine dell'articolo (BT-159) devono essere codici ISO 3166-1 alpha-2",
    "Item standard identifier schemes (BT-157) must be ISO 6523 ICD codes": "Gli schemi degli identificativi standard dell'articolo (BT-157) devono essere codici ISO 6523 ICD",
    "Electronic address schemes (BT-34, BT-49) must be CEF EAS codes": "Gli schemi degli indirizzi elettronici (BT-34, BT-49) devono essere codici CEF EAS",
    "Attachment MIME codes must be on the PEPPOL subset of the IANA list": "I codici MIME degli allegati devono essere nel sottoinsieme PEPPOL dell'elenco IANA",
    "Allowance reason codes must be on the UNCL 5189 subset": "I codici motivo dello sconto devono essere nel sottoinsieme UNCL 5189",
    "Charge reason codes must be UNCL 7161 codes": "I codici motivo della maggiorazione devono essere codici UNCL 7161",
    "GLN identifiers must be digits with a valid GS1 check digit": "Gli identificativi GLN devono essere cifre con una cifra di controllo GS1 valida",
    "Legal registration schemes (BT-30, BT-47, BT-61) must be ISO 6523 ICD codes": "Gli schemi di registrazione legale (BT-30, BT-47, BT-61) devono essere codici ISO 6523 ICD",
    "Delivery location identifier schemes (BT-71) must be ISO 6523 ICD codes": "Gli schemi degli identificativi del luogo di consegna (BT-71) devono essere codici ISO 6523 ICD",
    "Danish CVR numbers must be 8 digits, optionally with the DK prefix": "I numeri CVR danesi devono avere 8 cifre, con prefisso DK facoltativo",
    "Split payment (B) may only be used on a domestic Italian invoice (every country code must be IT)": "La scissione dei pagamenti (B) può essere usata solo in una fattura nazionale italiana (ogni codice paese deve essere IT)",
    "IPA codes (Codice Univoco Unità Organizzativa) must have 6 letters or digits": "I codici IPA (Codice Univoco Unità Organizzativa) devono avere 6 lettere o cifre",
    "Only one project reference is allowed on a credit note": "In una nota di credito è ammesso un solo riferimento di progetto",
    "An address can only have one third line.": "Un indirizzo può avere una sola terza riga.",
    "Party tax scheme shall occur maximum twice in accounting supplier party": "Lo schema fiscale della parte può comparire al massimo due volte nella parte venditore",
    "Document level allowance reason shall occur maximum once": "Il motivo dello sconto a livello di documento può comparire al massimo una volta",
    "Document level charge reason shall occur maximum once": "Il motivo della maggiorazione a livello di documento può comparire al massimo una volta",
    "When there are more than one payment means code, they shall be equal": "Se ci sono più codici del mezzo di pagamento, devono essere uguali",
    "Invoice line note shall occur maximum once": "La nota della riga di fattura può comparire al massimo una volta",
    "Referenced purchase order line identifier shall occur maximum once": "L'identificativo della riga dell'ordine di acquisto può comparire al massimo una volta",
    "Invoice line period shall occur maximum once": "Il periodo della riga di fattura può comparire al massimo una volta",
    "Item price discount shall occur maximum once": "Lo sconto sul prezzo dell'articolo può comparire al massimo una volta",
    "Invoice lines shall have one and only one classified tax category.": "Le righe di fattura devono avere una e una sola categoria IVA.",
    "If there is a preceding invoice reference, the preceding invoice number shall be present": "Se c'è un riferimento a una fattura precedente, ne deve essere indicato il numero",
    "Seller tax representative name shall occur maximum once, if the Seller has a tax representative": "Il nome del rappresentante fiscale può comparire al massimo una volta, se il venditore ha un rappresentante fiscale",
    "Seller tax representative VAT identifier shall occur maximum once, if the Seller has a tax representative": "La partita IVA del rappresentante fiscale può comparire al massimo una volta, se il venditore ha un rappresentante fiscale",
    "All amounts must use the invoice currency (BT-5), except the VAT total in the accounting currency": "Tutti gli importi devono usare la valuta della fattura (BT-5), tranne il totale IVA nella valuta di contabilizzazione",
    "There must be exactly one VAT total (BT-110) in the invoice currency": "Deve esserci esattamente un totale IVA (BT-110) nella valuta della fattura",
    "The invoice must have its document totals (BG-22)": "La fattura deve avere i totali del documento (BG-22)",
    "VAT category codes of the breakdown, allowances and charges (BT-95, BT-102, BT-118) must be UNTDID 5305 codes": "I codici categoria IVA del riepilogo, degli sconti e delle maggiorazioni (BT-95, BT-102, BT-118) devono essere codici UNTDID 5305",
    "Invoice type code 326 or 384 is only allowed when both buyer and seller are German organisations": "Il tipo documento 326 o 384 è ammesso solo quando acquirente e venditore sono organizzazioni tedesche",
    "Identifier schemes (BT-29, BT-46, BT-60, BT-71) must be ISO 6523 ICD codes (SEPA for the seller or payee)": "Gli schemi degli identificativi (BT-29, BT-46, BT-60, BT-71) devono essere codici ISO 6523 ICD (SEPA per venditore o beneficiario)"
  });

  // English only translates the messages that are not English already (the German text of the XRechnung rules)
  const EN = { exact: {}, patterns: [], words: [] };
  const DICTS = { it: { exact: IT, patterns: IT_PATTERNS, words: IT_WORDS }, en: EN };

  const fill = (s, vars) => (vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : String(s));

  // Fixed UI text: T("English {n}", { n: 3 }).
  function T(en, vars) {
    const d = DICTS[lang];
    return fill(d && Object.prototype.hasOwnProperty.call(d.exact, en) ? d.exact[en] : en, vars);
  }

  // A finished English message (check texts and details): exact, then pattern, then word by word.
  // strict: null unless the text has an exact translation or matches a pattern (no word-by-word fallback); the tests use it
  function tr(text, depth, strict) {
    const d = DICTS[lang];
    if (!d || !text) return strict ? null : text;
    if (Object.prototype.hasOwnProperty.call(d.exact, text)) return d.exact[text];
    if ((depth || 0) < 3 || strict) {
      for (const p of d.patterns) {
        const m = p.re.exec(text);
        if (!m) continue;
        const vars = {};
        p.names.forEach((n, i) => { vars[n] = n[0] === "_" ? m[i + 1] : tr(m[i + 1], (depth || 0) + 1); });   // {_x}: a technical name, left as written
        return fill(p.it, vars);
      }
    }
    if (strict) return null;
    let out = text;
    for (const [re, to] of d.words) out = out.replace(re, to);
    return out;
  }

  // Elements in the page marked data-i18n (text), data-i18n-ph (placeholder), data-i18n-aria (aria-label).
  function applyStatic(root) {
    (root || document).querySelectorAll("[data-i18n]").forEach((el) => {
      if (!el.dataset.en) el.dataset.en = el.textContent;
      el.textContent = T(el.dataset.en);
    });
    (root || document).querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = T(el.dataset.i18nPh); });
    (root || document).querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", T(el.dataset.i18nAria)); });
    document.documentElement.lang = lang;
    document.title = T("eDocument XML Viewer");
  }

  const listeners = [];
  window.I18N = {
    get lang() { return lang; },
    langs: LANGS,
    locale: () => LANGS[lang].locale,
    set(l) {
      if (!LANGS[l] || l === lang) return;
      lang = l;
      try { localStorage.setItem(KEY, l); } catch (e) {}
      applyStatic();
      listeners.forEach((f) => f(l));
    },
    onChange: (f) => listeners.push(f),
    // Italian texts from a country's own file: exact texts, and patterns [["English with {x}", "Italiano con {x}"], …]
    addItalian: (map, patterns) => { Object.assign(IT, map); (patterns || []).forEach((p) => IT_PATTERNS.push(compile(p))); },
    addEnglish: (map, patterns) => { Object.assign(EN.exact, map); (patterns || []).forEach((p) => EN.patterns.push(compile(p))); },
    T, tr, applyStatic
  };
  window.T = T;
})();
