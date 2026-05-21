import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { checkCoreHealth, runSapAgent } from "./api/client";
import { initialMigrationState } from "./state/migrationState";
import type {
  ChatAction,
  ChatMessage,
  CloudProvider,
  DestinationWarehouse,
  MigrationState,
  SapTable,
  SourceSystem,
} from "./types/migration";

type ChatEntry = Pick<ChatMessage, "role" | "text" | "actions">;
type SetupTopic = "source" | "cloud" | "destination";
type ConfirmedSetup = {
  source: boolean;
  cloud: boolean;
  destination: boolean;
  sourceConnection: boolean;
  destinationConnection: boolean;
};

interface SetupOption<T extends string> {
  id: T;
  badge: string;
  title: string;
  detail: string;
}

type LlmRouteOptions = {
  assistantActions?: ChatAction[];
  statePatch?: Partial<MigrationState>;
  confirmedOverride?: ConfirmedSetup;
  pendingUserText?: string;
  notice?: string;
};

const sourceOptions: SetupOption<SourceSystem>[] = [
  {
    id: "sap_s4",
    badge: "S4",
    title: "SAP S/4HANA",
    detail: "OData and API based extraction.",
  },
  {
    id: "sap_ecc",
    badge: "ECC",
    title: "SAP ECC",
    detail: "Classic SAP table and metadata extraction.",
  },
  {
    id: "oracle",
    badge: "OR",
    title: "Oracle",
    detail: "Database and schema based extraction.",
  },
  {
    id: "custom",
    badge: "CU",
    title: "Custom",
    detail: "Describe the system and connector details.",
  },
];

const cloudOptions: SetupOption<CloudProvider>[] = [
  {
    id: "azure",
    badge: "AZ",
    title: "Azure",
    detail: "Blob, ADLS Gen2, Synapse, or Databricks.",
  },
  {
    id: "aws",
    badge: "AWS",
    title: "AWS",
    detail: "S3 and lake landing patterns.",
  },
  {
    id: "gcp",
    badge: "GCP",
    title: "Google Cloud",
    detail: "Cloud Storage and BigQuery patterns.",
  },
];

const destinationOptions: SetupOption<DestinationWarehouse>[] = [
  {
    id: "azure_blob",
    badge: "BL",
    title: "Azure Blob Storage",
    detail: "Object storage landing zone.",
  },
  {
    id: "adls_gen2",
    badge: "DL",
    title: "ADLS Gen2",
    detail: "Hierarchical data lake landing zone.",
  },
  {
    id: "synapse",
    badge: "SY",
    title: "Synapse",
    detail: "Warehouse handoff.",
  },
  {
    id: "databricks",
    badge: "DB",
    title: "Databricks",
    detail: "Lakehouse ingestion target.",
  },
];

const initialChatMessages: ChatMessage[] = [
  {
    id: "assistant-start",
    role: "assistant",
    text:
      "👋 Welcome! I'm your AI migration assistant. I'll guide you through setting up your data migration from SAP to the cloud step by step.\n\n" +
      "We'll start by configuring three key areas: your **Source** system (where data comes from), the **Cloud** provider, and the **Destination** (where data will land).\n\n" +
      "Don't worry if you're not sure about technical details - I can help you find everything you need! Let's begin by choosing what you'd like to configure first:",
    actions: [
      { label: "📦 Source System", kind: "show_source_options", tone: "primary" },
      { label: "☁️ Cloud Provider", kind: "show_cloud_options" },
      { label: "🎯 Destination", kind: "show_destination_options" },
    ],
  },
];

function createMessage(
  role: ChatMessage["role"],
  text: string,
  actions?: ChatAction[],
): ChatMessage {
  return {
    id: `${Date.now()}-${role}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    actions,
  };
}

function getOptionTitle<T extends string>(options: SetupOption<T>[], id: T) {
  return options.find((option) => option.id === id)?.title ?? id;
}

function optionActions<T extends string>(
  options: SetupOption<T>[],
  kind: ChatAction["kind"],
): ChatAction[] {
  return options.map((option) => ({
    label: option.title,
    kind,
    value: option.id,
  }));
}

function SetupLauncher({
  topic,
  status,
  active,
  onOpen,
}: {
  topic: SetupTopic;
  status: string;
  active: boolean;
  onOpen: (topic: SetupTopic) => void;
}) {
  const iconPaths: Record<SetupTopic, JSX.Element> = {
    source: (
      <>
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v8c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
        <path d="M5 10c0 1.7 3.1 3 7 3s7-1.3 7-3" />
      </>
    ),
    cloud: (
      <path d="M7 17h10.5a4 4 0 0 0 .7-7.9A6 6 0 0 0 6.8 8.2 4.5 4.5 0 0 0 7 17Z" />
    ),
    destination: (
      <>
        <path d="M4 6h9v6H4z" />
        <path d="M13 9h6" />
        <path d="m16 6 3 3-3 3" />
        <path d="M7 15h13v3H7z" />
      </>
    ),
  };

  return (
    <button
      className={`setup-launcher ${active ? "selected" : ""}`}
      type="button"
      onClick={() => onOpen(topic)}
    >
      <span className={`setup-icon ${topic}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          {iconPaths[topic]}
        </svg>
      </span>
      <span>{status}</span>
      <strong>{topic}</strong>
      <small>Open in chat</small>
    </button>
  );
}

function CatalogResults({
  tables,
  selectedTables,
  onToggle,
  collapsed,
  onCollapsedChange,
}: {
  tables: SapTable[];
  selectedTables: SapTable[];
  onToggle: (table: SapTable) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const countLabel =
    tables.length === 0 ? "No scan results" : `${selectedTables.length}/${tables.length} selected`;

  if (collapsed) {
    return (
      <section className="catalog-rail" aria-label="Collapsed catalog">
        <button
          className="collapse-button icon-only"
          type="button"
          aria-label="Expand catalog"
          onClick={() => onCollapsedChange(false)}
        >
          {"›"}
        </button>
      </section>
    );
  }

  if (tables.length === 0) {
    return (
      <section className="assistant-card empty-state">
        <div className="assistant-card-heading">
          <span>Catalog</span>
          <button
            className="collapse-button icon-only"
            type="button"
            aria-label="Collapse catalog"
            onClick={() => onCollapsedChange(true)}
          >
            {"‹"}
          </button>
        </div>
        <strong>{countLabel}</strong>
        <p>The assistant will receive table candidates after discovery runs.</p>
      </section>
    );
  }

  return (
    <section className="assistant-card">
      <div className="assistant-card-heading">
        <span>Catalog received</span>
        <button
          className="collapse-button icon-only"
          type="button"
          aria-label="Collapse catalog"
          onClick={() => onCollapsedChange(true)}
        >
          {"‹"}
        </button>
      </div>
      <strong>{countLabel}</strong>
      <div className="table-card-list">
        {tables.map((table) => (
          <article className={`table-card ${table.selected ? "selected" : ""}`} key={table.id}>
            <div>
              <strong>{table.name}</strong>
              <p>{table.description}</p>
              <small>
                {table.module} | {table.estimatedRows.toLocaleString()} rows | {table.confidence}%
                confidence
              </small>
            </div>
            <button
              className={table.selected ? "secondary-button" : "primary-button"}
              type="button"
              onClick={() => onToggle(table)}
            >
              {table.selected ? "Remove" : "Select"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function App() {
  const [state, setState] = useState<MigrationState>({
    ...initialMigrationState,
    chatMessages: initialChatMessages,
  });
  const [confirmed, setConfirmed] = useState<ConfirmedSetup>({
    source: false,
    cloud: false,
    destination: false,
    sourceConnection: false,
    destinationConnection: false,
  });
  const [coreOnline, setCoreOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("Ready for LLM-guided migration setup.");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkCoreHealth().then(setCoreOnline);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [state.chatMessages.length, busy, state.scannedTables.length, state.approval]);

  const selectedTables = useMemo(
    () => state.scannedTables.filter((table) => table.selected),
    [state.scannedTables],
  );

  const messageIntegrity = useMemo(
    () =>
      state.chatMessages.every(
        (message) =>
          (message.role === "assistant" || message.role === "user") &&
          (!message.actions ||
            message.actions.every((action) => Boolean(action.kind) && Boolean(action.label))),
      ),
    [state.chatMessages],
  );

  function appendMessages(entries: ChatEntry[]) {
    setState((previous) => ({
      ...previous,
      chatMessages: [
        ...previous.chatMessages,
        ...entries.map((entry) => createMessage(entry.role, entry.text, entry.actions)),
      ],
    }));
  }

  function updateWithMessages(patch: Partial<MigrationState>, entries: ChatEntry[]) {
    setState((previous) => ({
      ...previous,
      ...patch,
      chatMessages: [
        ...previous.chatMessages,
        ...entries.map((entry) => createMessage(entry.role, entry.text, entry.actions)),
      ],
    }));
  }

  function nextRequirement(
    nextConfirmed: ConfirmedSetup,
    prefix: string,
    setupState: MigrationState = state,
  ) {
    const setupSelectedTables = setupState.scannedTables.filter((table) => table.selected);

    if (!nextConfirmed.source) {
      return `${prefix}\n\nRequired next: choose the source.`;
    }

    if (!nextConfirmed.cloud) {
      return `${prefix}\n\nRequired next: choose the cloud provider.`;
    }

    if (!nextConfirmed.destination) {
      return `${prefix}\n\nRequired next: choose the destination.`;
    }

    if (!nextConfirmed.sourceConnection) {
      return `${prefix}\n\nRequired next: provide or confirm source connection details.`;
    }

    if (!nextConfirmed.destinationConnection) {
      return `${prefix}\n\nRequired next: provide or confirm destination landing details.`;
    }

    if (setupState.scannedTables.length === 0) {
      return `${prefix}\n\nRequired next: review the captured migration setup.`;
    }

    if (setupSelectedTables.length === 0) {
      return `${prefix}\n\nRequired next: select at least one table for the migration plan.`;
    }

    if (!setupState.approval) {
      return `${prefix}\n\nRequired next: request backend approval for the upload.`;
    }

    return `${prefix}\n\nRequired next: approve or reject the active backend request.`;
  }

  async function sendChatActionToLlm(
    userText: string,
    prompt: string,
    options: Omit<LlmRouteOptions, "pendingUserText"> = {},
  ) {
    if (options.confirmedOverride) {
      setConfirmed(options.confirmedOverride);
    }

    setState((previous) => ({
      ...previous,
      ...options.statePatch,
      chatMessages: [...previous.chatMessages, createMessage("user", userText)],
    }));

    await routePrompt(prompt, {
      ...options,
      pendingUserText: userText,
    });
  }

  function shouldUseLlmRouting() {
    return true;
  }

  function showSourceOptions(echoUser = true) {
    if (shouldUseLlmRouting()) {
      void showSourceOptionsWithLlm(echoUser);
      return;
    }

    appendMessages([
      ...(echoUser ? [{ role: "user" as const, text: "📦 Source System" }] : []),
      {
        role: "assistant",
        text:
          "Great! Let's start with your source system - this is where your data currently lives.\n\n" +
          "Choose the type of source system you're migrating from. Once you select one, I'll guide you through " +
          "finding the connection details. If you're not sure where to get these details, I'm here to help! 😊",
        actions: [
          ...optionActions(sourceOptions, "select_source"),
          { label: "❓ How to find source details", kind: "show_source_help", tone: "secondary" },
        ],
      },
    ]);
    setNotice("Choose a source option in chat.");
  }

  function showCloudOptions(echoUser = true) {
    if (shouldUseLlmRouting()) {
      void showCloudOptionsWithLlm(echoUser);
      return;
    }

    appendMessages([
      ...(echoUser ? [{ role: "user" as const, text: "☁️ Cloud Provider" }] : []),
      {
        role: "assistant",
        text:
          "Perfect! Now let's select your cloud provider - this is where your migrated data will be hosted.\n\n" +
          "After you choose, I'll ask about the specific destination service and help you with access details.",
        actions: optionActions(cloudOptions, "select_cloud"),
      },
    ]);
    setNotice("Choose a cloud option in chat.");
  }

  function showDestinationOptions(echoUser = true) {
    if (shouldUseLlmRouting()) {
      void showDestinationOptionsWithLlm(echoUser);
      return;
    }

    appendMessages([
      ...(echoUser ? [{ role: "user" as const, text: "🎯 Destination" }] : []),
      {
        role: "assistant",
        text:
          "Excellent! Now let's choose your destination service - the specific storage location where your data will land.\n\n" +
          "I'll then help you configure container names, folder paths, and credentials. " +
          "Don't worry if you're unsure about any of these - I can guide you through each step!",
        actions: [
          ...optionActions(destinationOptions, "select_destination"),
          { label: "❓ How to find destination details", kind: "show_destination_help" },
        ],
      },
    ]);
    setNotice("Choose a destination option in chat.");
  }

  function sourceDetailsText(sourceSystem: SourceSystem) {
    const title = getOptionTitle(sourceOptions, sourceSystem);

    if (sourceSystem === "oracle") {
      return [
        `Received: ${title} is saved as the source.`,
        "",
        "Details I need:",
        "- Hostname and port",
        "- Service name or SID",
        "- Schema or table scope",
        "- Username and password or wallet/auth method",
        "",
        "If you do not know these, choose the help option and I will show the steps.",
      ].join("\n");
    }

    if (sourceSystem === "custom") {
      return [
        `Received: ${title} is saved as the source.`,
        "",
        "Details I need:",
        "- System type",
        "- API base URL, database host, or file location",
        "- Authentication method",
        "- Data objects to migrate",
        "- Expected volume and refresh schedule",
        "",
        "If you do not know these, choose the help option and I will show the steps.",
      ].join("\n");
    }

    return [
      `Received: ${title} is saved as the source.`,
      "",
      "Details I need:",
      "- SAP base URL",
      "- Client ID",
      "- Username",
      "- Password or API token",
      "- OData service/API scope",
      "",
      "If you do not know these, choose the help option and I will show the steps.",
    ].join("\n");
  }

  function selectSource(sourceSystem: SourceSystem, echoUser = true) {
    if (shouldUseLlmRouting()) {
      void selectSourceWithLlm(sourceSystem, echoUser);
      return;
    }

    const optionTitle = getOptionTitle(sourceOptions, sourceSystem);
    const nextConfirmed = { ...confirmed, source: true };
    const actions: ChatAction[] = [
      { label: "I need help finding these details", kind: "need_help_with_this", value: "source", tone: "primary" },
      { label: "Use demo source", kind: "use_demo_source", tone: "secondary" },
      { label: "I have the details, let's proceed", kind: "provide_source_details" },
    ];
    const entries: ChatEntry[] = [];

    if (echoUser) {
      entries.push({ role: "user", text: optionTitle });
    }

    entries.push({
      role: "assistant",
      text: nextRequirement(nextConfirmed, sourceDetailsText(sourceSystem)),
      actions,
    });

    setConfirmed(nextConfirmed);
    updateWithMessages({ sourceSystem }, entries);
    setNotice("Source selected. Choose if you need help or have the details ready.");
  }

  function showSourceHelp(echoUser = true) {
    if (shouldUseLlmRouting()) {
      void showSourceHelpWithLlm(echoUser);
      return;
    }

    appendMessages([
      ...(echoUser ? [{ role: "user" as const, text: "I need help finding these details" }] : []),
      {
        role: "assistant",
        text: [
          "No problem! I'll guide you through finding each piece of information you need. Let me break this down step by step:",
          "",
          "**Finding the SAP Base URL:**",
          "- This is typically something like `https://your-sap-system.company.com:port` or `http://sap-server:8000`",
          "- Ask your SAP Basis team or system administrator for the OData or API endpoint URL",
          "- Check your company's SAP documentation or IT portal",
          "- Look in SAP GUI logon screen (transaction /nSMICM) for HTTP service URLs",
          "",
          "**Finding Client ID (Mandant):**",
          "- This is usually a 3-digit number like 100, 200, or 800",
          "- You can find it in SAP GUI logon screen (the field called 'Client')",
          "- Ask your SAP admin which client to use for data extraction",
          "",
          "**Getting Username & Password:**",
          "- You'll need an SAP service account or your personal SAP credentials",
          "- Check with your SAP security team for API access accounts",
          "- Ensure the account has authorization for OData services and table reads",
          "",
          "Would you like to use the demo source for now, or do you have these details ready?",
        ].join("\n"),
        actions: [
          { label: "Use demo source for testing", kind: "use_demo_source", tone: "primary" },
          { label: "I found the details, let's continue", kind: "provide_source_details" },
          { label: "More help with finding the URL", kind: "guide_source_url" },
        ],
      },
    ]);
  }

  function selectCloud(cloudProvider: CloudProvider, echoUser = true) {
    if (shouldUseLlmRouting()) {
      void selectCloudWithLlm(cloudProvider, echoUser);
      return;
    }

    const optionTitle = getOptionTitle(cloudOptions, cloudProvider);
    const nextConfirmed = { ...confirmed, cloud: true };
    const entries: ChatEntry[] = [];

    if (echoUser) {
      entries.push({ role: "user", text: optionTitle });
    }

    entries.push({
      role: "assistant",
      text: nextRequirement(
        nextConfirmed,
        [
          `Received: ${optionTitle} is saved as the cloud.`,
          "",
          "Details I may need next:",
          "- Subscription/account/project",
          "- Region",
          "- Storage service",
          "- Identity or access method",
        ].join("\n"),
      ),
      actions: [{ label: "Choose destination", kind: "show_destination_options", tone: "primary" }],
    });

    setConfirmed(nextConfirmed);
    updateWithMessages({ cloudProvider }, entries);
    setNotice("Cloud selected. Destination options are available in chat.");
  }

  function destinationDetailsText(destination: DestinationWarehouse) {
    const title = getOptionTitle(destinationOptions, destination);

    return [
      `Received: ${title} is saved as the destination.`,
      "",
      "Details I need:",
      "- Container, bucket, or workspace name",
      "- Landing folder/path",
      "- Connection string, key, service principal, or managed identity",
      "- Approval owner for the write operation",
      "",
      "If you do not know these, choose the help option and I will show the steps.",
    ].join("\n");
  }

  function selectDestination(destination: DestinationWarehouse, echoUser = true) {
    if (shouldUseLlmRouting()) {
      void selectDestinationWithLlm(destination, echoUser);
      return;
    }

    const optionTitle = getOptionTitle(destinationOptions, destination);
    const nextConfirmed = { ...confirmed, destination: true };
    const entries: ChatEntry[] = [];

    if (echoUser) {
      entries.push({ role: "user", text: optionTitle });
    }

    entries.push({
      role: "assistant",
      text: nextRequirement(nextConfirmed, destinationDetailsText(destination)),
      actions: [
        { label: "I need help finding these details", kind: "need_help_with_this", value: "destination", tone: "primary" },
        { label: "Use default landing", kind: "use_default_destination", tone: "secondary" },
        { label: "I have the details, let's proceed", kind: "provide_destination_details" },
      ],
    });

    setConfirmed(nextConfirmed);
    updateWithMessages({ destination }, entries);
    setNotice("Destination selected. Choose if you need help or have the details ready.");
  }

  function showDestinationHelp(echoUser = true) {
    if (shouldUseLlmRouting()) {
      void showDestinationHelpWithLlm(echoUser);
      return;
    }

    const cloud = getOptionTitle(cloudOptions, state.cloudProvider);
    const destTitle = getOptionTitle(destinationOptions, state.destination);

    appendMessages([
      ...(echoUser ? [{ role: "user" as const, text: "I need help finding these details" }] : []),
      {
        role: "assistant",
        text: [
          `Great! I'll help you find the details for ${destTitle} on ${cloud}. Let me guide you through each step:`,
          "",
          "**Finding or Creating a Container/Bucket:**",
          "- Log into Azure Portal (portal.azure.com)",
          "- Navigate to your Storage Account",
          "- Click on 'Containers' in the left sidebar",
          "- Either select an existing container or create a new one",
          "- The container name is what you'll need (e.g., 'sap-api', 'data-lake')",
          "",
          "**Setting Up the Landing Folder:**",
          "- This is a path inside your container where data will be stored",
          "- Common patterns: 'raw/sap', 'landing/sap-s4', 'bronze/source-data'",
          "- You can create folders by uploading a placeholder file or just specify the path",
          "",
          "**Getting Connection Details:**",
          "For Azure Blob Storage, you need ONE of these options:",
          "• **Connection String**: Go to Storage Account → Access Keys → Copy connection string",
          "• **Account Name + Key**: Same location, copy Account Name and one of the keys",
          "• **SAS Token**: Storage Account → Shared access signature → Generate SAS and connection string",
          "",
          "**Important Security Note:**",
          "- Never share these credentials in public channels",
          "- Use environment variables or secure vaults in production",
          "- Consider using Managed Identity for production deployments",
          "",
          "Would you like to use default settings for now, or do you have the details?",
        ].join("\n"),
        actions: [
          { label: "Use default landing for testing", kind: "use_default_destination", tone: "primary" },
          { label: "I have the details, let's continue", kind: "provide_destination_details" },
          { label: "More help with Azure Storage setup", kind: "guide_destination_storage" },
        ],
      },
    ]);
  }

  function handleNeedHelp(topic: "source" | "destination", echoUser = true) {
    if (shouldUseLlmRouting()) {
      void handleNeedHelpWithLlm(topic, echoUser);
      return;
    }

    if (topic === "source") {
      showSourceHelp(echoUser);
    } else {
      showDestinationHelp(echoUser);
    }
  }

  function guideSourceUrl(echoUser = true) {
    if (shouldUseLlmRouting()) {
      void guideSourceUrlWithLlm(echoUser);
      return;
    }

    appendMessages([
      ...(echoUser ? [{ role: "user" as const, text: "More help with finding the URL" }] : []),
      {
        role: "assistant",
        text: [
          "Let me give you more detailed guidance on finding your SAP system URL:",
          "",
          "**Method 1: Check SAP GUI Logon Pad**",
          "1. Open SAP GUI on your computer",
          "2. Right-click on your system connection",
          "3. Select 'Properties'",
          "4. Look for 'Application Server' or 'Message Server'",
          "5. The URL format is usually: `http://[server-name]:[port]`",
          "",
          "**Method 2: Ask Your SAP Basis Team**",
          "Send them an email asking:",
          '- "What is the OData/API endpoint URL for our SAP system?"',
          '- "Which port is used for HTTP/HTTPS services?"',
          '- "Is there a gateway or reverse proxy URL I should use?"',
          "",
          "**Method 3: Check Company IT Documentation**",
          "- Look in your IT wiki or SharePoint",
          "- Search for 'SAP integration endpoints'",
          "- Check API documentation if your company has one",
          "",
          "**Common URL Patterns:**",
          "• On-Premise: `http://sap-server.company.com:8000`",
          "• Cloud: `https://mycompany.s4hana.cloud.sap`",
          "• Gateway: `https://gateway.company.com/sap/opu/odata`",
          "",
          "Once you have the URL, you can proceed with the other details!",
        ].join("\n"),
        actions: [
          { label: "Use demo source", kind: "use_demo_source", tone: "primary" },
          { label: "I have all the details now", kind: "provide_source_details" },
        ],
      },
    ]);
  }

  function guideDestinationStorage(echoUser = true) {
    if (shouldUseLlmRouting()) {
      void guideDestinationStorageWithLlm(echoUser);
      return;
    }

    const cloud = getOptionTitle(cloudOptions, state.cloudProvider);
    
    appendMessages([
      ...(echoUser ? [{ role: "user" as const, text: "More help with Azure Storage setup" }] : []),
      {
        role: "assistant",
        text: [
          `Let me walk you through setting up ${cloud} storage step-by-step:`,
          "",
          "**Step 1: Access Azure Portal**",
          "1. Go to https://portal.azure.com",
          "2. Sign in with your company account",
          "3. If you don't have access, contact your cloud administrator",
          "",
          "**Step 2: Find or Create Storage Account**",
          "1. In the search bar at top, type 'Storage accounts'",
          "2. Click on 'Storage accounts' service",
          "3. Either select an existing account or click '+ Create'",
          "4. Note the Storage Account Name (e.g., 'mycompanystorage')",
          "",
          "**Step 3: Create or Select Container**",
          "1. Click on your storage account",
          "2. In the left menu, click 'Containers' under 'Data storage'",
          "3. Click '+ Container' to create new, or select existing",
          "4. Choose a meaningful name like 'sap-migration' or 'data-lake'",
          "",
          "**Step 4: Get Access Keys**",
          "1. In storage account, click 'Access keys' under 'Security + networking'",
          "2. Click 'Show keys' next to key1",
          "3. Copy either:",
          "   • The full Connection String, OR",
          "   • Storage account name + Key value",
          "",
          "**Step 5: Define Landing Folder**",
          "- Choose a folder path like: `landing/sap` or `raw/sap-data`",
          "- This will be created automatically when data is uploaded",
          "",
          "**Security Tips:**",
          "- For production, use Managed Identity or Service Principal instead of keys",
          "- Set up network restrictions and firewall rules",
          "- Enable soft delete and versioning for data protection",
          "",
          "Ready to continue?",
        ].join("\n"),
        actions: [
          { label: "Use default landing", kind: "use_default_destination", tone: "primary" },
          { label: "I have all the details now", kind: "provide_destination_details" },
        ],
      },
    ]);
  }

  function provideSourceDetails(echoUser = true) {
    if (shouldUseLlmRouting()) {
      void provideSourceDetailsWithLlm(echoUser);
      return;
    }

    const nextConfirmed = { ...confirmed, sourceConnection: true };
    appendMessages([
      ...(echoUser ? [{ role: "user" as const, text: "I have the source details ready" }] : []),
      {
        role: "assistant",
        text: [
          "Perfect! Since this is a demo environment, I've noted that you have the source connection details.",
          "",
          "In a production scenario, you would now enter:",
          "• SAP Base URL",
          "• Client ID",
          "• Username",
          "• Password or API token",
          "",
          "For now, let's proceed to the next step. What would you like to configure next?",
        ].join("\n"),
        actions: [
          { label: "Choose cloud provider", kind: "show_cloud_options", tone: "primary" },
          { label: "Use demo source for testing", kind: "use_demo_source" },
        ],
      },
    ]);
    setConfirmed(nextConfirmed);
  }

  function provideDestinationDetails(echoUser = true) {
    if (shouldUseLlmRouting()) {
      void provideDestinationDetailsWithLlm(echoUser);
      return;
    }

    const nextConfirmed = { ...confirmed, destinationConnection: true };
    appendMessages([
      ...(echoUser ? [{ role: "user" as const, text: "I have the destination details ready" }] : []),
      {
        role: "assistant",
        text: [
          "Excellent! You have the destination details ready.",
          "",
          "In a production scenario, you would now enter:",
          "• Container/bucket name",
          "• Landing folder path",
          "• Connection string or access credentials",
          "",
          "For this demo, let's proceed with the migration setup. Ready to continue?",
        ].join("\n"),
        actions: [
          { label: "Scan SAP tables", kind: "run_scan", tone: "primary" },
          { label: "Use default landing for testing", kind: "use_default_destination" },
        ],
      },
    ]);
    setConfirmed(nextConfirmed);
  }

  function useDemoSourceConnection(echoUser = true) {
    if (shouldUseLlmRouting()) {
      void useDemoSourceConnectionWithLlm(echoUser);
      return;
    }

    const nextConfirmed = { ...confirmed, sourceConnection: true };
    const entries: ChatEntry[] = [];

    if (echoUser) {
      entries.push({ role: "user", text: "Use demo source" });
    }

    entries.push({
      role: "assistant",
      text: nextRequirement(
        nextConfirmed,
        [
          "Received: demo source connection saved.",
          "",
          "Saved details:",
          "- Base URL: http://127.0.0.1:8011",
          "- Client ID: 100",
          "- Username: demo",
        ].join("\n"),
      ),
      actions: [{ label: "Choose cloud", kind: "show_cloud_options", tone: "primary" }],
    });

    setConfirmed(nextConfirmed);
    updateWithMessages(
      {
        sourceCredentials: {
          ...state.sourceCredentials,
          baseUrl: "http://127.0.0.1:8011",
          username: "demo",
          password: "demo123",
          clientId: "100",
        },
      },
      entries,
    );
    setNotice("Demo SAP source connection saved.");
  }

  function useDefaultDestination(echoUser = true) {
    if (shouldUseLlmRouting()) {
      void useDefaultDestinationWithLlm(echoUser);
      return;
    }

    const nextConfirmed = { ...confirmed, destinationConnection: true };
    const entries: ChatEntry[] = [];

    if (echoUser) {
      entries.push({ role: "user", text: "Use default landing" });
    }

    entries.push({
      role: "assistant",
      text: nextRequirement(
        nextConfirmed,
        [
          "Received: default destination landing saved.",
          "",
          "Saved details:",
          "- Container: sap-api",
          "- Landing folder: sap-s4",
        ].join("\n"),
      ),
      actions: [{ label: "Scan SAP tables", kind: "run_scan", tone: "primary" }],
    });

    setConfirmed(nextConfirmed);
    updateWithMessages(
      {
        destinationCredentials: {
          ...state.destinationCredentials,
          containerName: "sap-api",
          landingFolder: "sap-s4",
        },
      },
      entries,
    );
    setNotice("Default destination landing settings saved.");
  }

  async function testCoreApi(echoUser = true) {
    if (shouldUseLlmRouting()) {
      await testCoreApiWithLlm(echoUser);
      return;
    }

    if (echoUser) {
      appendMessages([{ role: "user", text: "Test Core API" }]);
    }

    setBusy(true);
    setNotice("Checking the core API health endpoint...");

    const ok = await checkCoreHealth();
    setCoreOnline(ok);
    appendMessages([
      {
        role: "assistant",
        text: ok
          ? "Received: Core API is reachable and ready for approval-gated migration calls."
          : "Received: Core API is offline. Start the backend server or update VITE_CORE_API_URL.",
      },
    ]);
    setNotice(ok ? "Core API is reachable." : "Core API is not reachable.");
    setBusy(false);
  }

  async function runScan(prompt = "Scan all available SAP tables", echoUser = true) {
    await runScanWithLlm(prompt, echoUser);
  }

  function toggleTable(table: SapTable) {
    const selected = !table.selected;
    const nextTables = state.scannedTables.map((candidate) =>
      candidate.id === table.id ? { ...candidate, selected } : candidate,
    );
    const nextSelectedCount = nextTables.filter((candidate) => candidate.selected).length;

    updateWithMessages(
      { scannedTables: nextTables },
      [
        {
          role: "user",
          text: `${selected ? "Selected" : "Removed"} table: ${table.name}`,
        },
        {
          role: "assistant",
          text: `Received: ${table.name} ${selected ? "added to" : "removed from"} the migration plan. ${nextSelectedCount} table${nextSelectedCount === 1 ? "" : "s"} selected now.`,
          actions:
            nextSelectedCount > 0
              ? [{ label: "Request approval", kind: "request_approval", tone: "primary" }]
              : undefined,
        },
      ],
    );
  }

  function buildMigrationPrompt() {
    const tableNames = selectedTables.map((table) => table.name).join(", ");
    const limit = selectedTables.length > 1 ? "top 10 records from each selected table" : "top 10 records";
    const cloud = getOptionTitle(cloudOptions, state.cloudProvider);
    const destination = getOptionTitle(destinationOptions, state.destination);

    return [
      `Prepare an approval-gated migration for ${limit} from ${getOptionTitle(sourceOptions, state.sourceSystem)} for these selected objects: ${tableNames}.`,
      `Use ${destination} on ${cloud} with landing folder ${state.destinationCredentials.landingFolder || "the configured landing folder"}.`,
      "Ask for human approval before writing to the destination.",
    ].join(" ");
  }

  async function requestApproval(echoUser = true) {
    if (shouldUseLlmRouting()) {
      await requestApprovalWithLlm(echoUser);
      return;
    }

    if (echoUser) {
      appendMessages([{ role: "user", text: "Request approval" }]);
    }

    if (selectedTables.length === 0) {
      appendMessages([
        {
          role: "assistant",
          text: "Received: approval cannot be created yet. Scan and select at least one table first.",
        },
      ]);
      setNotice("Select at least one table before requesting approval.");
      return;
    }

    setBusy(true);
    setNotice("Asking the SAP agent to prepare an approval-gated upload...");
    appendMessages([
      {
        role: "assistant",
        text: "Received: approval request. I am sending the migration plan to the backend agent.",
      },
    ]);

    try {
      const response = await runSapAgent({ message: buildMigrationPrompt() });
      const approvalText =
        response.status === "approval_required" && response.approval
          ? `Received: backend approval created.\n\n${response.approval.summary}\n\nRequired next: approve or reject the upload.`
          : `Received: backend agent responded with ${response.status}.\n\n${response.message}`;

      setState((previous) => ({
        ...previous,
        approval: response.approval ?? null,
        lastAgentResponse: response,
        chatMessages: [
          ...previous.chatMessages,
          createMessage("assistant", approvalText, [
            { label: "Approve", kind: "resolve_approval", value: "approve", tone: "primary" },
            { label: "Reject", kind: "resolve_approval", value: "reject", tone: "danger" },
          ]),
        ],
      }));
      setNotice(
        response.status === "approval_required"
          ? "Approval request created. Review it before upload."
          : response.message,
      );
    } catch (error) {
      appendMessages([
        {
          role: "assistant",
          text:
            error instanceof Error
              ? `Received: backend approval failed because ${error.message}`
              : "Received: backend approval failed. Check the API and try again.",
        },
      ]);
      setNotice(error instanceof Error ? error.message : "Unable to create approval request.");
    } finally {
      setBusy(false);
    }
  }

  async function resolveApproval(approve: boolean, echoUser = true) {
    if (echoUser) {
      appendMessages([{ role: "user", text: approve ? "Approve upload" : "Reject upload" }]);
    }

    if (!state.approval) {
      appendMessages([
        {
          role: "assistant",
          text: "Received: no active backend approval exists. Request approval first.",
          actions: [{ label: "Request approval", kind: "request_approval", tone: "primary" }],
        },
      ]);
      setNotice("No active approval request found.");
      return;
    }

    setBusy(true);
    setNotice(approve ? "Approving upload and resuming the backend graph..." : "Rejecting upload request...");

    try {
      const response = await runSapAgent({
        message: approve
          ? "Approve the pending SAP write request."
          : "Reject the pending SAP write request.",
        approval_id: state.approval.approval_id,
        approve,
      });

      setState((previous) => ({
        ...previous,
        approval: response.approval ?? null,
        lastAgentResponse: response,
        chatMessages: [
          ...previous.chatMessages,
          createMessage("assistant", `Received: backend agent returned ${response.status}.\n\n${response.message}`),
        ],
      }));
      setNotice(response.message);
    } catch (error) {
      appendMessages([
        {
          role: "assistant",
          text:
            error instanceof Error
              ? `Received: approval resolution failed because ${error.message}`
              : "Received: approval resolution failed. Try again.",
        },
      ]);
      setNotice(error instanceof Error ? error.message : "Unable to resolve approval.");
    } finally {
      setBusy(false);
    }
  }

  async function showSourceOptionsWithLlm(echoUser = true) {
    const prompt = [
      "The user wants to choose the migration source system.",
      `Available source options: ${sourceOptions
        .map((option) => `${option.title} - ${option.detail}`)
        .join("; ")}.`,
      "Reply as the assistant, keep the setup sequence centered on source selection, and ask the user to choose one option.",
      "Mention that you can help find connection details if they are unsure.",
    ].join("\n");
    const actions: ChatAction[] = [
      ...optionActions(sourceOptions, "select_source"),
      { label: "How to find source details", kind: "show_source_help", tone: "secondary" },
    ];

    if (echoUser) {
      await sendChatActionToLlm("Source System", prompt, {
        assistantActions: actions,
        notice: "Asking the LLM for source options...",
      });
      return;
    }

    await routePrompt(prompt, {
      assistantActions: actions,
      notice: "Asking the LLM for source options...",
    });
  }

  async function showCloudOptionsWithLlm(echoUser = true) {
    const prompt = [
      "The user wants to choose the cloud provider for the migration.",
      `Available cloud options: ${cloudOptions
        .map((option) => `${option.title} - ${option.detail}`)
        .join("; ")}.`,
      "Reply as the assistant and ask the user to choose the cloud provider.",
    ].join("\n");

    if (echoUser) {
      await sendChatActionToLlm("Cloud Provider", prompt, {
        assistantActions: optionActions(cloudOptions, "select_cloud"),
        notice: "Asking the LLM for cloud options...",
      });
      return;
    }

    await routePrompt(prompt, {
      assistantActions: optionActions(cloudOptions, "select_cloud"),
      notice: "Asking the LLM for cloud options...",
    });
  }

  async function showDestinationOptionsWithLlm(echoUser = true) {
    const prompt = [
      "The user wants to choose the destination service for the migration landing zone.",
      `Available destination options: ${destinationOptions
        .map((option) => `${option.title} - ${option.detail}`)
        .join("; ")}.`,
      "Reply as the assistant and ask the user to choose the destination service.",
      "Keep the details focused on location, credentials, and approval. Do not ask about file formats.",
    ].join("\n");
    const actions: ChatAction[] = [
      ...optionActions(destinationOptions, "select_destination"),
      { label: "How to find destination details", kind: "show_destination_help" },
    ];

    if (echoUser) {
      await sendChatActionToLlm("Destination", prompt, {
        assistantActions: actions,
        notice: "Asking the LLM for destination options...",
      });
      return;
    }

    await routePrompt(prompt, {
      assistantActions: actions,
      notice: "Asking the LLM for destination options...",
    });
  }

  async function selectSourceWithLlm(sourceSystem: SourceSystem, echoUser = true) {
    const optionTitle = getOptionTitle(sourceOptions, sourceSystem);
    const nextConfirmed = { ...confirmed, source: true };
    const actions: ChatAction[] = [
      { label: "I need help finding these details", kind: "need_help_with_this", value: "source", tone: "primary" },
      { label: "Use demo source", kind: "use_demo_source", tone: "secondary" },
      { label: "I have the details, let's proceed", kind: "provide_source_details" },
    ];
    const prompt = [
      `The user selected ${optionTitle} as the migration source.`,
      "Reply as the assistant. Confirm the selection and explain the source connection details needed next.",
      "For SAP sources, ask for base URL, client ID, username, password or token, and OData/API scope.",
      "If they are unsure, offer to help them find the details.",
    ].join("\n");

    if (echoUser) {
      await sendChatActionToLlm(optionTitle, prompt, {
        assistantActions: actions,
        statePatch: { sourceSystem },
        confirmedOverride: nextConfirmed,
        notice: "Asking the LLM for source-detail guidance...",
      });
      return;
    }

    setConfirmed(nextConfirmed);
    await routePrompt(prompt, {
      assistantActions: actions,
      statePatch: { sourceSystem },
      confirmedOverride: nextConfirmed,
      notice: "Asking the LLM for source-detail guidance...",
    });
  }

  async function selectCloudWithLlm(cloudProvider: CloudProvider, echoUser = true) {
    const optionTitle = getOptionTitle(cloudOptions, cloudProvider);
    const nextConfirmed = { ...confirmed, cloud: true };
    const prompt = [
      `The user selected ${optionTitle} as the cloud provider.`,
      "Reply as the assistant. Confirm the selection and ask them to choose the destination service next.",
      "Keep the sequence short and practical.",
    ].join("\n");

    if (echoUser) {
      await sendChatActionToLlm(optionTitle, prompt, {
        assistantActions: [{ label: "Choose destination", kind: "show_destination_options", tone: "primary" }],
        statePatch: { cloudProvider },
        confirmedOverride: nextConfirmed,
        notice: "Asking the LLM for the next cloud setup step...",
      });
      return;
    }

    setConfirmed(nextConfirmed);
    await routePrompt(prompt, {
      assistantActions: [{ label: "Choose destination", kind: "show_destination_options", tone: "primary" }],
      statePatch: { cloudProvider },
      confirmedOverride: nextConfirmed,
      notice: "Asking the LLM for the next cloud setup step...",
    });
  }

  async function selectDestinationWithLlm(destination: DestinationWarehouse, echoUser = true) {
    const optionTitle = getOptionTitle(destinationOptions, destination);
    const nextConfirmed = { ...confirmed, destination: true };
    const actions: ChatAction[] = [
      { label: "I need help finding these details", kind: "need_help_with_this", value: "destination", tone: "primary" },
      { label: "Use default landing", kind: "use_default_destination", tone: "secondary" },
      { label: "I have the details, let's proceed", kind: "provide_destination_details" },
    ];
    const prompt = [
      `The user selected ${optionTitle} as the destination service.`,
      "Reply as the assistant. Confirm the selection and explain the destination details needed next.",
      "Ask for container, bucket, workspace, landing folder/path, connection credentials, and approval owner as relevant.",
      "Do not ask the user to choose an output file format.",
    ].join("\n");

    if (echoUser) {
      await sendChatActionToLlm(optionTitle, prompt, {
        assistantActions: actions,
        statePatch: { destination },
        confirmedOverride: nextConfirmed,
        notice: "Asking the LLM for destination-detail guidance...",
      });
      return;
    }

    setConfirmed(nextConfirmed);
    await routePrompt(prompt, {
      assistantActions: actions,
      statePatch: { destination },
      confirmedOverride: nextConfirmed,
      notice: "Asking the LLM for destination-detail guidance...",
    });
  }

  async function showSourceHelpWithLlm(echoUser = true) {
    const prompt = [
      "The user needs help finding source connection details.",
      `Current source: ${getOptionTitle(sourceOptions, state.sourceSystem)}.`,
      "Reply as the assistant with practical steps for finding the source URL, client or tenant details, username, and credentials.",
      "For SAP, include SAP GUI, Basis team, OData/API endpoint, and client ID guidance.",
    ].join("\n");
    const actions: ChatAction[] = [
      { label: "Use demo source for testing", kind: "use_demo_source", tone: "primary" },
      { label: "I found the details, let's continue", kind: "provide_source_details" },
      { label: "More help with finding the URL", kind: "guide_source_url" },
    ];

    if (echoUser) {
      await sendChatActionToLlm("I need help finding these details", prompt, {
        assistantActions: actions,
        notice: "Asking the LLM for source help...",
      });
      return;
    }

    await routePrompt(prompt, {
      assistantActions: actions,
      notice: "Asking the LLM for source help...",
    });
  }

  async function showDestinationHelpWithLlm(echoUser = true) {
    const prompt = [
      "The user needs help finding destination landing details.",
      `Current cloud: ${getOptionTitle(cloudOptions, state.cloudProvider)}.`,
      `Current destination: ${getOptionTitle(destinationOptions, state.destination)}.`,
      "Reply as the assistant with practical steps to find or create the container/bucket/workspace, landing folder/path, and access credentials.",
      "Do not ask about file formats.",
    ].join("\n");
    const actions: ChatAction[] = [
      { label: "Use default landing for testing", kind: "use_default_destination", tone: "primary" },
      { label: "I have the details, let's continue", kind: "provide_destination_details" },
      { label: "More help with storage setup", kind: "guide_destination_storage" },
    ];

    if (echoUser) {
      await sendChatActionToLlm("I need help finding these details", prompt, {
        assistantActions: actions,
        notice: "Asking the LLM for destination help...",
      });
      return;
    }

    await routePrompt(prompt, {
      assistantActions: actions,
      notice: "Asking the LLM for destination help...",
    });
  }

  async function handleNeedHelpWithLlm(topic: "source" | "destination", echoUser = true) {
    if (topic === "source") {
      await showSourceHelpWithLlm(echoUser);
      return;
    }

    await showDestinationHelpWithLlm(echoUser);
  }

  async function guideSourceUrlWithLlm(echoUser = true) {
    const prompt = [
      "The user wants more help finding the SAP source URL.",
      "Reply as the assistant with detailed but concise methods: SAP GUI connection properties, SAP Basis team questions, company documentation, and common OData/API URL patterns.",
    ].join("\n");
    const actions: ChatAction[] = [
      { label: "Use demo source", kind: "use_demo_source", tone: "primary" },
      { label: "I have all the details now", kind: "provide_source_details" },
    ];

    if (echoUser) {
      await sendChatActionToLlm("More help with finding the URL", prompt, {
        assistantActions: actions,
        notice: "Asking the LLM for SAP URL guidance...",
      });
      return;
    }

    await routePrompt(prompt, {
      assistantActions: actions,
      notice: "Asking the LLM for SAP URL guidance...",
    });
  }

  async function guideDestinationStorageWithLlm(echoUser = true) {
    const prompt = [
      "The user wants more help setting up destination storage.",
      `Cloud: ${getOptionTitle(cloudOptions, state.cloudProvider)}.`,
      `Destination: ${getOptionTitle(destinationOptions, state.destination)}.`,
      "Reply as the assistant with step-by-step guidance for finding/creating storage, container or bucket, landing folder/path, and credentials.",
      "Do not include file format choices.",
    ].join("\n");
    const actions: ChatAction[] = [
      { label: "Use default landing", kind: "use_default_destination", tone: "primary" },
      { label: "I have all the details now", kind: "provide_destination_details" },
    ];

    if (echoUser) {
      await sendChatActionToLlm("More help with storage setup", prompt, {
        assistantActions: actions,
        notice: "Asking the LLM for storage setup guidance...",
      });
      return;
    }

    await routePrompt(prompt, {
      assistantActions: actions,
      notice: "Asking the LLM for storage setup guidance...",
    });
  }

  async function provideSourceDetailsWithLlm(echoUser = true) {
    const nextConfirmed = { ...confirmed, sourceConnection: true };
    const prompt = [
      "The user says they have the source connection details ready.",
      "Reply as the assistant. Confirm the source connection step and ask them to continue with cloud provider selection if it is not done yet.",
    ].join("\n");

    if (echoUser) {
      await sendChatActionToLlm("I have the source details ready", prompt, {
        assistantActions: [
          { label: "Choose cloud provider", kind: "show_cloud_options", tone: "primary" },
          { label: "Use demo source for testing", kind: "use_demo_source" },
        ],
        confirmedOverride: nextConfirmed,
        notice: "Asking the LLM for the next source setup step...",
      });
      return;
    }

    setConfirmed(nextConfirmed);
    await routePrompt(prompt, {
      assistantActions: [
        { label: "Choose cloud provider", kind: "show_cloud_options", tone: "primary" },
        { label: "Use demo source for testing", kind: "use_demo_source" },
      ],
      confirmedOverride: nextConfirmed,
      notice: "Asking the LLM for the next source setup step...",
    });
  }

  async function provideDestinationDetailsWithLlm(echoUser = true) {
    const nextConfirmed = { ...confirmed, destinationConnection: true };
    const prompt = [
      "The user says they have the destination landing details ready.",
      "Reply as the assistant. Confirm the destination connection step and suggest asking for the SAP table list or scan when they are ready.",
      "Do not mention file formats.",
    ].join("\n");

    if (echoUser) {
      await sendChatActionToLlm("I have the destination details ready", prompt, {
        assistantActions: [{ label: "Get SAP table list", kind: "run_scan", tone: "primary" }],
        confirmedOverride: nextConfirmed,
        notice: "Asking the LLM for the next destination setup step...",
      });
      return;
    }

    setConfirmed(nextConfirmed);
    await routePrompt(prompt, {
      assistantActions: [{ label: "Get SAP table list", kind: "run_scan", tone: "primary" }],
      confirmedOverride: nextConfirmed,
      notice: "Asking the LLM for the next destination setup step...",
    });
  }

  async function useDemoSourceConnectionWithLlm(echoUser = true) {
    const nextConfirmed = { ...confirmed, sourceConnection: true };
    const sourceCredentials = {
      ...state.sourceCredentials,
      baseUrl: "http://127.0.0.1:8011",
      username: "demo",
      password: "demo123",
      clientId: "100",
    };
    const prompt = [
      "The user chose the demo SAP source connection.",
      "Demo source saved: base URL http://127.0.0.1:8011, client ID 100, username demo.",
      "Reply as the assistant and ask them to choose the cloud provider next if needed.",
    ].join("\n");

    if (echoUser) {
      await sendChatActionToLlm("Use demo source", prompt, {
        assistantActions: [{ label: "Choose cloud", kind: "show_cloud_options", tone: "primary" }],
        statePatch: { sourceCredentials },
        confirmedOverride: nextConfirmed,
        notice: "Asking the LLM to confirm the demo source...",
      });
      return;
    }

    setConfirmed(nextConfirmed);
    await routePrompt(prompt, {
      assistantActions: [{ label: "Choose cloud", kind: "show_cloud_options", tone: "primary" }],
      statePatch: { sourceCredentials },
      confirmedOverride: nextConfirmed,
      notice: "Asking the LLM to confirm the demo source...",
    });
  }

  async function useDefaultDestinationWithLlm(echoUser = true) {
    const nextConfirmed = { ...confirmed, destinationConnection: true };
    const destinationCredentials = {
      ...state.destinationCredentials,
      containerName: "sap-api",
      landingFolder: "sap-s4",
    };
    const prompt = [
      "The user chose the default destination landing settings.",
      "Default landing saved: container sap-api, landing folder sap-s4.",
      "Reply as the assistant and suggest asking for the SAP table list next.",
      "Do not mention file formats.",
    ].join("\n");

    if (echoUser) {
      await sendChatActionToLlm("Use default landing", prompt, {
        assistantActions: [{ label: "Get SAP table list", kind: "run_scan", tone: "primary" }],
        statePatch: { destinationCredentials },
        confirmedOverride: nextConfirmed,
        notice: "Asking the LLM to confirm the default landing...",
      });
      return;
    }

    setConfirmed(nextConfirmed);
    await routePrompt(prompt, {
      assistantActions: [{ label: "Get SAP table list", kind: "run_scan", tone: "primary" }],
      statePatch: { destinationCredentials },
      confirmedOverride: nextConfirmed,
      notice: "Asking the LLM to confirm the default landing...",
    });
  }

  async function testCoreApiWithLlm(echoUser = true) {
    if (echoUser) {
      appendMessages([{ role: "user", text: "Test Core API" }]);
    }

    setBusy(true);
    setNotice("Checking the core API health endpoint...");

    const ok = await checkCoreHealth();
    setCoreOnline(ok);
    setBusy(false);

    if (!ok) {
      appendMessages([
        {
          role: "assistant",
          text: "Received: Core API is offline. Start the backend server or update VITE_CORE_API_URL.",
        },
      ]);
      setNotice("Core API is not reachable.");
      return;
    }

    await routePrompt("The user clicked Test Core API. The health endpoint is reachable. Reply with the current API readiness and next migration step.", {
      pendingUserText: echoUser ? "Test Core API" : undefined,
      notice: "Asking the LLM to summarize API readiness...",
    });
  }

  async function runScanWithLlm(prompt = "Get SAP table list", echoUser = true) {
    const llmPrompt = [
      `The user's request is: ${prompt}`,
      "If this asks to inspect, list, fetch, scan, or migrate SAP data, use the SAP backend tools/agent to get the table list or relevant SAP data.",
      "Do not use frontend dummy metadata. Do not ask for an output file format.",
      "Return the useful table/API names and the next migration step.",
    ].join("\n");

    if (echoUser) {
      await sendChatActionToLlm(prompt, llmPrompt, {
        assistantActions: [{ label: "Request approval", kind: "request_approval", tone: "primary" }],
        notice: "Asking the LLM for SAP table discovery...",
      });
      return;
    }

    await routePrompt(llmPrompt, {
      assistantActions: [{ label: "Request approval", kind: "request_approval", tone: "primary" }],
      notice: "Asking the LLM for SAP table discovery...",
    });
  }

  async function requestApprovalWithLlm(echoUser = true) {
    const prompt =
      selectedTables.length > 0
        ? buildMigrationPrompt()
        : [
            "The user wants to request approval for the SAP migration.",
            "Use the current conversation and any SAP table list already discovered by the backend agent.",
            "If enough table and destination information is available, create the approval-gated backend request.",
            "If details are missing, ask only for the missing details. Do not ask for file formats.",
          ].join("\n");

    if (echoUser) {
      await sendChatActionToLlm("Request approval", prompt, {
        notice: "Asking the SAP agent to prepare an approval-gated upload...",
      });
      return;
    }

    await routePrompt(prompt, {
      notice: "Asking the SAP agent to prepare an approval-gated upload...",
    });
  }

  function openSetupTopic(topic: SetupTopic) {
    if (topic === "source") {
      void showSourceOptionsWithLlm();
      return;
    }

    if (topic === "cloud") {
      void showCloudOptionsWithLlm();
      return;
    }

    void showDestinationOptionsWithLlm();
  }

  async function handleAction(action: ChatAction) {
    if (busy) {
      return;
    }

    if (action.kind === "show_source_options") {
      await showSourceOptionsWithLlm();
      return;
    }

    if (action.kind === "show_cloud_options") {
      await showCloudOptionsWithLlm();
      return;
    }

    if (action.kind === "show_destination_options") {
      await showDestinationOptionsWithLlm();
      return;
    }

    if (action.kind === "select_source") {
      await selectSourceWithLlm(action.value as SourceSystem);
      return;
    }

    if (action.kind === "select_cloud") {
      await selectCloudWithLlm(action.value as CloudProvider);
      return;
    }

    if (action.kind === "select_destination") {
      await selectDestinationWithLlm(action.value as DestinationWarehouse);
      return;
    }

    if (action.kind === "show_source_help") {
      await showSourceHelpWithLlm();
      return;
    }

    if (action.kind === "show_destination_help") {
      await showDestinationHelpWithLlm();
      return;
    }

    if (action.kind === "need_help_with_this") {
      await handleNeedHelpWithLlm(action.value as "source" | "destination");
      return;
    }

    if (action.kind === "guide_source_url") {
      await guideSourceUrlWithLlm();
      return;
    }

    if (action.kind === "guide_source_credentials") {
      await showSourceHelpWithLlm();
      return;
    }

    if (action.kind === "guide_destination_storage") {
      await guideDestinationStorageWithLlm();
      return;
    }

    if (action.kind === "guide_destination_credentials") {
      await showDestinationHelpWithLlm();
      return;
    }

    if (action.kind === "provide_source_details") {
      await provideSourceDetailsWithLlm();
      return;
    }

    if (action.kind === "provide_destination_details") {
      await provideDestinationDetailsWithLlm();
      return;
    }

    if (action.kind === "use_demo_source") {
      await useDemoSourceConnectionWithLlm();
      return;
    }

    if (action.kind === "use_default_destination") {
      await useDefaultDestinationWithLlm();
      return;
    }

    if (action.kind === "test_core") {
      await testCoreApiWithLlm();
      return;
    }

    if (action.kind === "run_scan") {
      await runScanWithLlm();
      return;
    }

    if (action.kind === "request_approval") {
      await requestApprovalWithLlm();
      return;
    }

    if (action.kind === "resolve_approval") {
      await resolveApproval(action.value === "approve");
      return;
    }

  }

  function buildAgentChatPrompt(prompt: string, options: LlmRouteOptions = {}) {
    const effectiveState: MigrationState = {
      ...state,
      ...options.statePatch,
    };
    const effectiveConfirmed = options.confirmedOverride ?? confirmed;
    const effectiveSelectedTables = effectiveState.scannedTables.filter((table) => table.selected);
    const selectedTableNames = effectiveSelectedTables.map((table) => table.name).join(", ") || "none";
    const scannedTableNames = effectiveState.scannedTables.map((table) => table.name).join(", ") || "none";
    const recentMessages: Array<Pick<ChatMessage, "role" | "text">> = [
      ...state.chatMessages,
      ...(options.pendingUserText ? [{ role: "user" as const, text: options.pendingUserText }] : []),
    ];
    const recentChat =
      recentMessages
        .slice(-8)
        .map((message) => `${message.role}: ${message.text}`)
        .join("\n") || "No previous chat in this session.";

    return [
      "You are responding inside the migration-frontend chat.",
      "Generate the assistant's next reply from the LLM. Keep the sequence centered on the user's latest prompt and the current setup state.",
      "Do not ask the user to choose a saved-file representation. Keep storage details focused on location, credentials, and approval.",
      "Use concise plain language. If a next step is required, state it explicitly.",
      "Only use SAP data tools when the latest prompt asks to inspect, list, fetch, scan, or migrate SAP data. For setup/help messages, answer with guidance only.",
      "The latest prompt is the source of truth. Use recent chat only as lightweight context, not as a script to repeat.",
      [
        "Current setup:",
        `- Source: ${getOptionTitle(sourceOptions, effectiveState.sourceSystem)} (${effectiveConfirmed.source ? "confirmed" : "pending"})`,
        `- Cloud: ${getOptionTitle(cloudOptions, effectiveState.cloudProvider)} (${effectiveConfirmed.cloud ? "confirmed" : "pending"})`,
        `- Destination: ${getOptionTitle(destinationOptions, effectiveState.destination)} (${effectiveConfirmed.destination ? "confirmed" : "pending"})`,
        `- Source connection: ${effectiveConfirmed.sourceConnection ? "confirmed" : "pending"}`,
        `- Destination connection: ${effectiveConfirmed.destinationConnection ? "confirmed" : "pending"}`,
        `- Scanned tables: ${scannedTableNames}`,
        `- Selected tables: ${selectedTableNames}`,
        `- Approval: ${effectiveState.approval ? "pending backend approval" : "none"}`,
      ].join("\n"),
      nextRequirement(effectiveConfirmed, "Frontend sequence context:", effectiveState),
      `Recent chat:\n${recentChat}`,
      `Latest user prompt:\n${prompt}`,
    ].join("\n\n");
  }

  async function routePrompt(prompt: string, options: LlmRouteOptions = {}) {
    setBusy(true);
    setNotice(options.notice ?? "Sending your prompt to the LLM...");

    try {
      const response = await runSapAgent({ message: buildAgentChatPrompt(prompt, options) });
      const approvalActions: ChatAction[] | undefined =
        response.status === "approval_required" && response.approval
          ? [
              { label: "Approve", kind: "resolve_approval", value: "approve", tone: "primary" },
              { label: "Reject", kind: "resolve_approval", value: "reject", tone: "danger" },
            ]
          : undefined;
      const responseActions = approvalActions ?? options.assistantActions;

      setState((previous) => ({
        ...previous,
        ...options.statePatch,
        approval: response.approval ?? previous.approval,
        lastAgentResponse: response,
        chatMessages: [
          ...previous.chatMessages,
          createMessage(
            "assistant",
            response.message || "Received: the LLM completed the request without additional details.",
            responseActions,
          ),
        ],
      }));
      setNotice(
        response.status === "approval_required"
          ? "Approval request created. Review it before upload."
          : "LLM response received.",
      );
    } catch (error) {
      appendMessages([
        {
          role: "assistant",
          text:
            error instanceof Error
              ? `Received: LLM request failed because ${error.message}`
              : "Received: LLM request failed. Check the API and try again.",
        },
      ]);
      setNotice(error instanceof Error ? error.message : "Unable to reach the LLM.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = draft.trim();
    if (!prompt || busy) {
      return;
    }

    setDraft("");
    appendMessages([{ role: "user", text: prompt }]);
    await routePrompt(prompt, { pendingUserText: prompt });
  }

  const sourceStatus = confirmed.source ? "Selected" : "Pending";
  const cloudStatus = confirmed.cloud ? "Selected" : "Pending";
  const destinationStatus = confirmed.destination ? "Selected" : "Pending";
  const healthClass = coreOnline === null ? "neutral" : coreOnline ? "ok" : "error";
  const healthLabel = coreOnline === null ? "Checking API" : coreOnline ? "Core API Online" : "Core API Offline";

  return (
    <main className={`chatbot-shell script-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`script-sidebar ${sidebarCollapsed ? "collapsed" : ""}`} aria-label="Navigation">
        <div className="brand-row">
          <span className="brand-symbol">AI</span>
          <strong>Migration</strong>
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            {sidebarCollapsed ? ">>" : "<<"}
          </button>
        </div>

        <label className="search-box">
          <span>Search</span>
          <input placeholder="Search" />
        </label>

        <nav className="side-nav">
          <button className="nav-item active" type="button">
            <span>+</span>
            AI Chat
          </button>
        </nav>

        <section className="catalog-nav" aria-label="Data catalog">
          <button className="tree-heading expanded" type="button">
            Data Catalog
          </button>
          <button className="catalog-db-card" type="button" onClick={() => void showSourceOptionsWithLlm()}>
            <span className="catalog-db-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <ellipse cx="12" cy="6" rx="7" ry="3" />
                <path d="M5 6v8c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
                <path d="M5 10c0 1.7 3.1 3 7 3s7-1.3 7-3" />
              </svg>
            </span>
            <span>
              <strong>sapecc_bronze_demo</strong>
              <small>SAP ECC bronze database</small>
            </span>
            <i>SAP</i>
          </button>
        </section>

        <div className="side-footer">
          <button className="nav-item" type="button" onClick={() => void testCoreApiWithLlm()}>
            <span>?</span>
            Test API
          </button>
        </div>
      </aside>
      <header className="chatbot-header">
        <div>
          <p className="eyebrow">Agentic Data Migration</p>
          <h1>AI Chat</h1>
        </div>
        <div className="status-strip">
          <span className={`status-pill ${healthClass}`}>
            <i />
            {healthLabel}
          </span>
          <span className={`status-pill ${busy ? "warn" : "ok"}`}>
            <i />
            {busy ? "Working" : "Ready"}
          </span>
          <span className={`status-pill ${messageIntegrity ? "ok" : "error"}`}>
            <i />
            LLM Guided
          </span>
        </div>
      </header>

      <section className="chat-workspace">
        <section className="conversation-panel" aria-label="Migration chatbot conversation">
          <div className="notice-bar" role="status">
            {notice}
          </div>

          <div className="chat-messages">
            <section className="welcome-panel" aria-label="Migration shortcuts">
              <h2>Welcome to Migration AI</h2>
              <p>
                Start by selecting a migration task. Chat will guide the required details,
                show how to find them, then prepare the migration setup.
              </p>

              <div className="setup-board compact" aria-label="Migration setup choices">
                <SetupLauncher
                  topic="source"
                  status={sourceStatus}
                  active={confirmed.source}
                  onOpen={openSetupTopic}
                />
                <SetupLauncher
                  topic="cloud"
                  status={cloudStatus}
                  active={confirmed.cloud}
                  onOpen={openSetupTopic}
                />
                <SetupLauncher
                  topic="destination"
                  status={destinationStatus}
                  active={confirmed.destination}
                  onOpen={openSetupTopic}
                />
              </div>
            </section>

            {state.chatMessages.map((message) => (
              <article className={`chat-message ${message.role}`} key={message.id}>
                <span>{message.role === "user" ? "Sent" : "Received"}</span>
                <p>{message.text}</p>
                {message.actions && message.actions.length > 0 && (
                  <div className="message-actions">
                    {message.actions.map((action) => (
                      <button
                        className={`message-action ${action.tone ?? "secondary"}`}
                        type="button"
                        key={`${message.id}-${action.kind}-${action.value ?? action.label}`}
                        onClick={() => handleAction(action)}
                        disabled={busy}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
            {busy && (
              <article className="chat-message assistant typing">
                <span>Received</span>
                <p>Working...</p>
              </article>
            )}
            <div ref={endRef} />
          </div>

          <form className="chat-composer" onSubmit={submitPrompt}>
            <input
              value={draft}
              placeholder="Type a request or use the chat options..."
              onChange={(event) => setDraft(event.target.value)}
            />
            <button className="primary-button" type="submit" disabled={busy || !draft.trim()}>
              Send
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
