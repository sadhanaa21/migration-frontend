import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { scanSapCatalog } from "./api/catalog";
import { checkCoreHealth, runSapAgent } from "./api/client";
import { initialMigrationState } from "./state/migrationState";
import type {
  ChatAction,
  ChatMessage,
  CloudProvider,
  DestinationWarehouse,
  MigrationState,
  OutputFormat,
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

const formatOptions: OutputFormat[] = ["parquet", "json", "csv"];

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

  function nextRequirement(nextConfirmed: ConfirmedSetup, prefix: string) {
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

    if (state.scannedTables.length === 0) {
      return `${prefix}\n\nRequired next: review the captured migration setup.`;
    }

    if (selectedTables.length === 0) {
      return `${prefix}\n\nRequired next: select at least one table for the migration plan.`;
    }

    if (!state.approval) {
      return `${prefix}\n\nRequired next: request backend approval for the upload.`;
    }

    return `${prefix}\n\nRequired next: approve or reject the active backend request.`;
  }

  function showSourceOptions(echoUser = true) {
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
    appendMessages([
      ...(echoUser ? [{ role: "user" as const, text: "🎯 Destination" }] : []),
      {
        role: "assistant",
        text:
          "Excellent! Now let's choose your destination service - the specific storage location where your data will land.\n\n" +
          "I'll then help you configure container names, folder paths, credentials, and output formats. " +
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
      "- Output format",
      "- Approval owner for the write operation",
      "",
      "If you do not know these, choose the help option and I will show the steps.",
    ].join("\n");
  }

  function selectDestination(destination: DestinationWarehouse, echoUser = true) {
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
    if (topic === "source") {
      showSourceHelp(echoUser);
    } else {
      showDestinationHelp(echoUser);
    }
  }

  function guideSourceUrl(echoUser = true) {
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
          "• Output format preference (Parquet, JSON, CSV)",
          "",
          "For this demo, let's proceed with the migration setup. Ready to continue?",
        ].join("\n"),
        actions: [
          { label: "Choose output format", kind: "set_format", value: "parquet", tone: "primary" },
          { label: "Use default landing for testing", kind: "use_default_destination" },
        ],
      },
    ]);
    setConfirmed(nextConfirmed);
  }

  function useDemoSourceConnection(echoUser = true) {
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
          "- Output format: PARQUET",
        ].join("\n"),
      ),
      actions: [
        { label: "PARQUET", kind: "set_format", value: "parquet" },
        { label: "JSON", kind: "set_format", value: "json" },
        { label: "CSV", kind: "set_format", value: "csv" },
      ],
    });

    setConfirmed(nextConfirmed);
    updateWithMessages(
      {
        destinationCredentials: {
          ...state.destinationCredentials,
          containerName: "sap-api",
          landingFolder: "sap-s4",
        },
        outputFormat: "parquet",
      },
      entries,
    );
    setNotice("Default destination landing settings saved.");
  }

  function setOutputFormat(outputFormat: OutputFormat, echoUser = true) {
    const entries: ChatEntry[] = [];

    if (echoUser) {
      entries.push({ role: "user", text: outputFormat.toUpperCase() });
    }

    entries.push({
      role: "assistant",
      text: nextRequirement(
        confirmed,
        `Received: ${outputFormat.toUpperCase()} is saved as the landing format.`,
      ),
    });

    updateWithMessages({ outputFormat }, entries);
    setNotice(`${outputFormat.toUpperCase()} selected as landing format.`);
  }

  async function testCoreApi(echoUser = true) {
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

  function buildScanReply(prompt: string, tables: SapTable[]) {
    const normalized = prompt.toLowerCase();
    const selected = tables.filter((table) => table.selected);
    const selectedNames = selected.map((table) => table.name).join(", ");

    if (normalized.includes("sales")) {
      return `Received: I found sales migration candidates and selected ${selectedNames || "none"}.\n\nRequired next: review the catalog cards and request approval when the plan is right.`;
    }

    if (normalized.includes("product") || normalized.includes("material")) {
      return `Received: I focused on product and material data and selected ${selectedNames || "none"}.\n\nRequired next: adjust table selections or request approval.`;
    }

    if (normalized.includes("customer") || normalized.includes("partner")) {
      return `Received: I narrowed the catalog to customer and business partner data and selected ${selectedNames || "none"}.\n\nRequired next: confirm the table plan.`;
    }

    return `Received: full scan complete. I found ${tables.length} candidates and selected ${selected.length} runnable API-backed tables for the first migration plan.`;
  }

  async function runScan(prompt = "Scan all available SAP tables", echoUser = true) {
    const startEntries: ChatEntry[] = [];

    if (echoUser) {
      startEntries.push({ role: "user", text: prompt });
    }

    startEntries.push({
      role: "assistant",
      text: "Received: scan request. I am reading available APIs and metadata candidates.",
    });
    appendMessages(startEntries);
    setBusy(true);
    setNotice("Discovery is reading available APIs and metadata candidates...");

    try {
      const tables = await scanSapCatalog(prompt);
      updateWithMessages(
        { scannedTables: tables },
        [
          {
            role: "assistant",
            text: buildScanReply(prompt, tables),
            actions: [{ label: "Request approval", kind: "request_approval", tone: "primary" }],
          },
        ],
      );
      setNotice("Scan completed. Review and adjust selected tables.");
    } catch (error) {
      appendMessages([
        {
          role: "assistant",
          text:
            error instanceof Error
              ? `Received: scan failed because ${error.message}`
              : "Received: scan failed. Try again.",
        },
      ]);
      setNotice("Scan failed.");
    } finally {
      setBusy(false);
    }
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
    const paths = selectedTables.map((table) => `${table.name} -> ${table.destinationPath}`).join("; ");
    const limit = selectedTables.length > 1 ? "top 10 records from each selected table" : "top 10 records";
    const cloud = getOptionTitle(cloudOptions, state.cloudProvider);
    const destination = getOptionTitle(destinationOptions, state.destination);

    return [
      `Fetch ${limit} from ${getOptionTitle(sourceOptions, state.sourceSystem)} for these selected objects: ${tableNames}.`,
      `Upload the fetched records to ${destination} on ${cloud} as ${state.outputFormat}.`,
      `Use these destination paths: ${paths}.`,
      "Ask for human approval before writing to the destination.",
    ].join(" ");
  }

  async function requestApproval(echoUser = true) {
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

  function openSetupTopic(topic: SetupTopic) {
    if (topic === "source") {
      showSourceOptions();
      return;
    }

    if (topic === "cloud") {
      showCloudOptions();
      return;
    }

    showDestinationOptions();
  }

  async function handleAction(action: ChatAction) {
    if (busy) {
      return;
    }

    if (action.kind === "show_source_options") {
      showSourceOptions();
      return;
    }

    if (action.kind === "show_cloud_options") {
      showCloudOptions();
      return;
    }

    if (action.kind === "show_destination_options") {
      showDestinationOptions();
      return;
    }

    if (action.kind === "select_source") {
      selectSource(action.value as SourceSystem);
      return;
    }

    if (action.kind === "select_cloud") {
      selectCloud(action.value as CloudProvider);
      return;
    }

    if (action.kind === "select_destination") {
      selectDestination(action.value as DestinationWarehouse);
      return;
    }

    if (action.kind === "show_source_help") {
      showSourceHelp();
      return;
    }

    if (action.kind === "show_destination_help") {
      showDestinationHelp();
      return;
    }

    if (action.kind === "need_help_with_this") {
      handleNeedHelp(action.value as "source" | "destination");
      return;
    }

    if (action.kind === "guide_source_url") {
      guideSourceUrl();
      return;
    }

    if (action.kind === "guide_source_credentials") {
      showSourceHelp(); // Can be enhanced further with specific credential guidance
      return;
    }

    if (action.kind === "guide_destination_storage") {
      guideDestinationStorage();
      return;
    }

    if (action.kind === "guide_destination_credentials") {
      showDestinationHelp(); // Can be enhanced further with specific credential guidance
      return;
    }

    if (action.kind === "provide_source_details") {
      provideSourceDetails();
      return;
    }

    if (action.kind === "provide_destination_details") {
      provideDestinationDetails();
      return;
    }

    if (action.kind === "use_demo_source") {
      useDemoSourceConnection();
      return;
    }

    if (action.kind === "use_default_destination") {
      useDefaultDestination();
      return;
    }

    if (action.kind === "test_core") {
      await testCoreApi();
      return;
    }

    if (action.kind === "run_scan") {
      await runScan();
      return;
    }

    if (action.kind === "request_approval") {
      await requestApproval();
      return;
    }

    if (action.kind === "resolve_approval") {
      await resolveApproval(action.value === "approve");
      return;
    }

    if (action.kind === "set_format") {
      setOutputFormat(action.value as OutputFormat);
    }
  }

  async function routePrompt(prompt: string) {
    const normalized = prompt.toLowerCase();

    if (normalized === "source" || normalized.includes("choose source")) {
      showSourceOptions(false);
      return;
    }

    if (normalized === "cloud" || normalized.includes("choose cloud")) {
      showCloudOptions(false);
      return;
    }

    if (normalized === "destination" || normalized.includes("choose destination")) {
      showDestinationOptions(false);
      return;
    }

    if (normalized.includes("source detail") || normalized.includes("source help")) {
      showSourceHelp(false);
      return;
    }

    if (normalized.includes("destination detail") || normalized.includes("destination help")) {
      showDestinationHelp(false);
      return;
    }

    if (normalized.includes("sap ecc")) {
      selectSource("sap_ecc", false);
      return;
    }

    if (normalized.includes("sap s/4") || normalized.includes("s4hana") || normalized.includes("s/4")) {
      selectSource("sap_s4", false);
      return;
    }

    if (normalized.includes("oracle")) {
      selectSource("oracle", false);
      return;
    }

    if (normalized.includes("custom source")) {
      selectSource("custom", false);
      return;
    }

    if (normalized.includes("azure blob") || normalized.includes("blob storage")) {
      selectDestination("azure_blob", false);
      return;
    }

    if (normalized.includes("adls")) {
      selectDestination("adls_gen2", false);
      return;
    }

    if (normalized.includes("synapse")) {
      selectDestination("synapse", false);
      return;
    }

    if (normalized.includes("databricks")) {
      selectDestination("databricks", false);
      return;
    }

    if (normalized.includes("aws")) {
      selectCloud("aws", false);
      return;
    }

    if (normalized.includes("gcp") || normalized.includes("google cloud")) {
      selectCloud("gcp", false);
      return;
    }

    if (normalized.includes("azure")) {
      selectCloud("azure", false);
      return;
    }

    if (normalized.includes("demo")) {
      useDemoSourceConnection(false);
      return;
    }

    if (normalized.includes("default")) {
      useDefaultDestination(false);
      return;
    }

    const requestedFormat = formatOptions.find((format) => normalized.includes(format));
    if (requestedFormat) {
      setOutputFormat(requestedFormat, false);
      return;
    }

    if (state.approval && normalized.includes("approve")) {
      await resolveApproval(true, false);
      return;
    }

    if (state.approval && (normalized.includes("reject") || normalized.includes("deny"))) {
      await resolveApproval(false, false);
      return;
    }

    if (normalized.includes("approval") || normalized.includes("approve")) {
      await requestApproval(false);
      return;
    }

    if (normalized.includes("health") || normalized.includes("test core") || normalized.includes("test api")) {
      await testCoreApi(false);
      return;
    }

    if (
      normalized.includes("scan") ||
      normalized.includes("find") ||
      normalized.includes("show") ||
      normalized.includes("table")
    ) {
      await runScan(prompt, false);
      return;
    }

    appendMessages([
      {
        role: "assistant",
        text: nextRequirement(
          confirmed,
          `Received: "${prompt}". I can turn that into a migration step when you choose Source, Cloud, or Destination.`,
        ),
        actions: [
          { label: "Source", kind: "show_source_options" },
          { label: "Cloud", kind: "show_cloud_options" },
          { label: "Destination", kind: "show_destination_options" },
        ],
      },
    ]);
  }

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = draft.trim();
    if (!prompt || busy) {
      return;
    }

    setDraft("");
    appendMessages([{ role: "user", text: prompt }]);
    await routePrompt(prompt);
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
          <button className="catalog-db-card" type="button" onClick={() => showSourceOptions()}>
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
          <button className="nav-item" type="button" onClick={() => testCoreApi()}>
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
