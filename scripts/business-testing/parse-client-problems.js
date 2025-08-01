#!/usr/bin/env node

// This script parses the client's industry problems from the feedback file
// and transforms them into our problems.json format

const clientProblems = [
  {
    id: "public-dc-fast-ev-charging",
    context: `Industry: Public DC Fast & Ultra-fast EV Charging Networks

Definition: Operation of public-facing fast and ultra-fast electric-vehicle charging plazas along highways, urban corridors, and destination sites, monetizing electricity sales, session fees, and on-site retail spend

Market Size: $8.1 billion
Market Size (Billions): $8.1B
1-Year Growth: 40%
5-Year Growth: 32%

Key Drivers:
1. National build-out subsidies and corridor mandates
2. OEM and charging-network roaming agreements increasing utilization
3. Premium pricing for high-power charging convenience
4. On-site solar and battery storage lowering cost of goods sold

Trends:
1. 400–1000 V liquid-cooled high-power chargers enabling sub-10-minute sessions (Weight: 9.2, Type: tech)
2. Grid-edge battery storage co-located to shave demand charges (Weight: 8.6, Type: tech)
3. Consumer expectation of seamless plug-and-charge payment experiences (Weight: 7.9, Type: behavioral)
4. Retail partnerships adding food, beverage, and parcel-logistics services at charging plazas (Weight: 6.8, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Fast electric vehicle charging networks work like roadside fuel stations for clean cars. Companies buy high-power chargers, connect them to the electric grid, and earn money every time a driver plugs in, plus any food or parcels sold on-site. Metals, semiconductors and battery cells are mined and processed into power modules, cooling lines and storage packs. Charger makers assemble cabinets and cables, which are shipped to planned sites. Developers secure permits and utility connections, pour concrete, install chargers, software and signage. Once switched on, energy flows from the grid or on-site solar and batteries into cars in minutes, while operators provide 24-hour payment, monitoring and repair support.

Supply Chain Flow Chart:
flowchart LR
 Raw_Minerals[Raw Minerals (copper, lithium, silicon)] --> Component_Foundries[Component Foundries]
 Raw_Minerals --> Battery_Cell_Plants[Battery Cell Plants]
 Component_Foundries --> Charger_OEM_Assembly[Charger OEM Assembly]
 Cooling_Module_Suppliers[Cooling Module Suppliers] --> Charger_OEM_Assembly
 Battery_Cell_Plants --> Energy_Storage_Integrators[Energy Storage Integrators]
 Charger_OEM_Assembly --> Site_Logistics[Site Logistics & Shipping]
 Energy_Storage_Integrators --> Site_Logistics
 Site_Logistics --> Permitting_Zoning[Permitting & Zoning ⚠️ $1.0B]
 Permitting_Zoning -.-> Utility_Interconnection[Utility Interconnection ⚠️ $2.1B]
 Utility_Interconnection --> Site_Construction[Site Construction]
 Site_Construction --> Commissioning_Software[Commissioning & Software Integration]
 Commissioning_Software --> Public_Charging_Plaza[Public Charging Plaza]
 Public_Charging_Plaza --> EV_Drivers[EV Drivers]
 Public_Charging_Plaza --> Retail_Partners[Retail Partners]
 Public_Charging_Plaza -.-> Field_Technician_Shortage[Field Technician Shortage ⚠️ $0.9B]
 Utility_Interconnection -.-> Peak_Demand_Costs[Peak Demand Costs ⚠️ $1.8B]
 Component_Foundries -.-> SiC_Semiconductor_Supply[SiC Semiconductor Supply ⚠️ $1.2B]


Total Impact (USD): $7000M
Analysis Date: 2025-07-12 20:52:31
Model Version: o3-2024-12-17`
  },
  {
    id: "telco-micro-insurance",
    context: `Industry: Telco Micro-Insurance & Protection

Definition: Premium and commission revenue from life, health, device and crop micro-insurance products bundled with airtime or wallet activity

Market Size: $5.2 billion
Market Size (Billions): $5.2B
1-Year Growth: 24%
5-Year Growth: 28%

Key Drivers:
1. Bundled 'freemium' cover converting to paid subscriptions after trial
2. API partnerships with regional underwriters for parametric weather and health products
3. Increasing regulatory approval of mobile distribution channels

Trends:
1. Satellite and IoT data for parametric crop claims (Weight: 8.3, Type: tech)
2. Consumer demand for financial protection post-pandemic (Weight: 7.8, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Mobile carriers bundle tiny life, health, phone or crop insurance with airtime or wallet top-ups. Underwriters design low-cost policies funded by re-insurance capital. Telcos push free trial cover by text; once users see value, they pay a small daily or monthly fee automatically deducted from airtime or mobile money. Satellite or IoT sensors trigger claims that pay straight to the phone wallet, avoiding paperwork. The chain starts with raw data and risk capital, moves through policy design, digital APIs, telco billing, regulatory sign-off, customer marketing and, finally, simple support desks that explain benefits and handle claims.

Supply Chain Flow Chart:
flowchart LR
 Risk_Capital[Risk Capital Providers] --> Policy_Design[Underwriter Policy Design]
 Actuarial_Satellite_Data[Actuarial & Satellite Data] --> Policy_Design
 Policy_Design --> API_Hub[API Gateway]
 API_Hub -.-> Regulatory_Approval[Regulatory Approval ⚠️ $500M]
 Regulatory_Approval -.-> Telco_Platform[Telco Billing & Wallet]
 API_Hub --> Telco_Platform
 Telco_Platform --> Customer_Onboarding[SMS / App Onboarding]
 Telco_Platform --> Claims_Trigger[IoT/Satellite Claim Trigger ⚠️ $600M]
 Customer_Onboarding --> Premium_Collection[Automatic Premium Collection]
 Premium_Collection --> Risk_Capital
 Claims_Trigger --> Claims_Processing[Automated Claims Processing]
 Claims_Processing --> Wallet_Payout[Wallet Payout]
 Wallet_Payout --> End_User[Subscribers & Farmers]
 Customer_Support[Customer Support Desk] -.-> End_User
 Device_Affordability[SIM & Smartphone Distribution ⚠️ $400M] -.-> Customer_Onboarding

 classDef bottleneck fill:#fdd
 class Regulatory_Approval,Claims_Trigger,Device_Affordability bottleneck


Total Impact (USD): $4020M
Analysis Date: 2025-07-12 20:51:19
Model Version: o3-2024-12-17`
  },
  {
    id: "audiobooks",
    context: `Industry: Audiobooks

Definition: Narrated spoken-word editions of consumer books delivered via download and streaming platforms

Market Size: $8.7 billion
Market Size (Billions): $8.7B
1-Year Growth: 20%
5-Year Growth: 26.2%

Key Drivers:
1. AI narration and voice cloning slashing production costs for backlists and niche titles
2. Bundling of audiobooks into music-streaming and super-apps expanding reach
3. Proliferation of smartphone listening and connected-car infotainment systems
4. Rapid localization into new languages unlocking non-English audiences

Trends:
1. Synthetic voice production and real-time voice morphing (Weight: 9, Type: tech)
2. Machine-learning personalization of listening speed, tone, and recommendations (Weight: 7.8, Type: tech)
3. Commuter and multitasking listening habits increasing content hours per user (Weight: 7.2, Type: behavioral)
4. All-you-can-listen subscriptions and credit rollovers reshaping pricing (Weight: 6.5, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Audiobooks begin as printed or digital books whose owners license audio rights. Producers convert text to sound by hiring human narrators or using artificial voices, recording in studios or software, then editing and mastering the tracks. Finished files go to large online platforms that protect the files, add prices, and stream or let users download them onto phones, smart speakers, and car dashboards. People buy them through subscriptions, credits, or single sales and listen while driving, exercising, or doing chores. Each play sends royalty money back up the chain, and support teams handle refunds, updates, and listener feedback.

Supply Chain Flow Chart:
flowchart LR
 Book_Rights[Book Rights] --> Script_Preparation[Script Preparation]
 Script_Preparation --> Rights_Clearance[Rights Clearance ⚠️ $1000M]
 Rights_Clearance --> Production_Planning[Production Planning]
 Narrator_Casting[Narrator Casting] -.-> Production_Planning
 AI_Voice_Generation[AI Voice Generation] -.-> Production_Planning
 Production_Planning --> Recording[Recording Studio]
 Production_Planning --> Synthetic_Recording[Synthetic Recording]
 Recording --> Editing_Mastering[Editing & Mastering]
 Synthetic_Recording --> Editing_Mastering
 Editing_Mastering --> Platform_Ingestion[Platform Ingestion & DRM]
 Platform_Ingestion --> Platform_Commissions[Platform Commissions ⚠️ $1100M]
 Platform_Commissions --> Streaming_Distribution[Streaming & Download Distribution]
 Streaming_Distribution --> Marketing_Discoverability[Marketing & Discoverability ⚠️ $750M]
 Streaming_Distribution --> Connected_Devices[Connected Devices]
 Marketing_Discoverability --> End_Listeners[End Listeners]
 Connected_Devices --> End_Listeners
 Regulatory_Compliance[Regulatory Compliance] -.-> Platform_Ingestion


Total Impact (USD): $4200M
Analysis Date: 2025-07-12 20:47:57
Model Version: o3-2024-12-17`
  },
  {
    id: "telco-edge-infrastructure",
    context: `Industry: Telco Edge Infrastructure-as-a-Service

Definition: Distributed compute, storage and acceleration capacity hosted in telecom central offices, aggregation sites and cell-tower locations and sold to enterprises and hyperscalers on an on-demand basis

Market Size: $7.5 billion
Market Size (Billions): $7.5B
1-Year Growth: 30%
5-Year Growth: 34%

Key Drivers:
1. AI/ML inference workloads requiring sub-10 ms round-trip latency
2. Hyperscaler-telco joint offers that bundle public cloud and carrier edge footprints
3. Enterprise demand for data-sovereign alternatives to hyperscale regions

Trends:
1. Deployment of GPU-dense micro-data-centers in 5G standalone sites (Weight: 9.1, Type: tech)
2. National data-residency mandates steering sensitive workloads to in-country telco edges (Weight: 7.6, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Telecom companies are turning parts of their cell towers and local switching hubs into tiny cloud data centers. They fill them with servers, graphics chips and fast networking so companies that need split-second response—such as video analytics, factory robots or retail checkout—can rent this nearby computer power on demand. Hardware makers ship servers to integrators, who build edge racks and send them to the telco site. After power, cooling and permits are ready, crews install the gear and load orchestration software that lets customers reserve capacity through an online portal. Enterprises and big cloud providers then deploy their apps, and the telco runs 24-hour support to keep everything working.

Supply Chain Flow Chart:
flowchart LR
 Raw_Silicon[Raw Silicon and Metals] --> Component_OEMs[Component OEMs]
 GPU_Modules[GPU Acceleration Modules] --> Server_Assembly[Server Assembly ⚠️ $900M]
 Component_OEMs --> Server_Assembly
 Server_Assembly --> Logistics[Global Logistics]
 Logistics --> Telco_Site_Prep[Telco Site Prep (Power/Cooling)]
 Regulatory_Permits[Regulatory Permits] -.-> Telco_Site_Prep
 Telco_Site_Prep --> Edge_Deployment[Edge Data Center Install ⚠️ $1.200B]
 Edge_Deployment --> Orchestration_Software[Orchestration Software]
 Peering_Backhaul[Peering & Backhaul Links] -.-> Orchestration_Software
 Orchestration_Software --> Marketplace_API[Edge Marketplace API]
 Marketplace_API --> Enterprise_Customers[Enterprise Customers]
 Marketplace_API --> Hyperscaler_Partners[Hyperscaler Partners]
 Support_Ops[24x7 Support Ops] -.-> Enterprise_Customers
 Support_Ops -.-> Hyperscaler_Partners


Total Impact (USD): $3700M
Analysis Date: 2025-07-12 20:51:11
Model Version: o3-2024-12-17`
  },
  {
    id: "ai-inference-accelerators",
    context: `Industry: AI Inference Accelerators

Definition: GPUs, ASICs, and edge cards optimized for low-latency, energy-efficient inference of AI models in cloud and on-premise servers

Market Size: $9.0 billion
Market Size (Billions): $9B
1-Year Growth: 38%
5-Year Growth: 30%

Key Drivers:
1. Mass deployment of GenAI copilots and retrieval-augmented applications
2. Enterprise shift from CPU to dedicated inference silicon for TCO savings
3. Rising demand for on-device and edge inference in latency-sensitive verticals

Trends:
1. Sparsity and quantization techniques baked into next-gen inference ASICs (Weight: 8.6, Type: tech)
2. AI cost-control policies pushing companies to optimize inference efficiency (Weight: 6.9, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
AI inference accelerators are special chips that quickly answer questions for artificial intelligence models while using less energy than normal processors. Chip designers license building-block designs and use software tools to plan the chip. Pure-play factories etch the design onto ultra-thin silicon wafers, then outside firms stack memory and wrap the chip in advanced packages. Boards are assembled with passive parts, flashed with firmware, and shipped with export permits to cloud data centers and edge devices. Operators bolt the cards into servers, load driver software, and run customer applications like chatbots or camera analytics. Vendors keep sending over software updates and field support to keep the chips running fast and safe.

Supply Chain Flow Chart:
flowchart LR
 Silicon_Wafers[Silicon Wafers] --> Foundry_Fabrication[Leading Edge Foundry Fabrication ⚠️ $1.6B]
 IP_Licensing[Chip IP Licensing] --> Foundry_Fabrication
 EDA_Tools[EDA Tools] --> Foundry_Fabrication
 High_Bandwidth_Memory[High Bandwidth Memory ⚠️ $1.1B] --> Advanced_Packaging[Advanced Packaging & Substrates ⚠️ $1.3B]
 Foundry_Fabrication --> Advanced_Packaging
 Advanced_Packaging --> Board_Assembly[Board Assembly]
 Passive_Components[Passive Components] --> Board_Assembly
 Firmware_Software[Firmware & Drivers] --> Integration_Testing[System Integration & Testing]
 Board_Assembly --> Integration_Testing
 Export_Controls[Export Controls & Permits ⚠️ $0.9B] -.-> Shipping[Global Shipping & Logistics]
 Integration_Testing --> Shipping
 Shipping --> Deployment[Cloud & Edge Deployment]
 Data_Center_Power[Data Center Power Capacity ⚠️ $1.4B] -.-> Deployment
 Deployment --> End_Users[Enterprise & Consumer Applications]

 Foundry_Fabrication:::bottleneck
 Advanced_Packaging:::bottleneck
 High_Bandwidth_Memory:::bottleneck
 Export_Controls:::bottleneck
 Data_Center_Power:::bottleneck


Total Impact (USD): $6300M
Analysis Date: 2025-07-12 20:55:12
Model Version: o3-2024-12-17`
  },
  {
    id: "fleet-rideshare-charging",
    context: `Industry: Fleet & Rideshare Charging Lounges

Definition: Dedicated fast-charging hubs with amenities for commercial EV fleets, ride-hailing and delivery drivers, monetizing mandatory rest periods with food, lounges and services

Market Size: $10.0 billion
Market Size (Billions): $10B
1-Year Growth: 31%
5-Year Growth: 26%

Key Drivers:
1. Electrification mandates for urban delivery and ride-hailing fleets
2. Time-sensitive charging needs of high-utilization vehicles
3. Value-added services such as maintenance, washing and Wi-Fi raising ARPU
4. Corporate sustainability targets driving fleet contract volumes

Trends:
1. Telematics-integrated energy management platforms scheduling fleet charging (Weight: 8.7, Type: tech)
2. Labor regulations requiring driver rest and recharge breaks (Weight: 6.9, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Fleet and rideshare charging lounges are like gas stations rebuilt for electric vans and ride-hailing cars. Owners lease or buy land, install very fast chargers, add restrooms, coffee, Wi-Fi and light repair bays, then sign contracts with delivery fleets or app-based drivers. Power comes from the grid, passes through on-site transformers and battery buffers, and reaches the chargers. Permits, grid tie-ins and equipment deliveries must all line up before the lounge opens. After launch, drivers pay or their companies pay, data flows back to schedule the next visit, and the operator maintains chargers and sells food and services.

Supply Chain Flow Chart:
flowchart LR
 Electricity_Providers[Electricity Providers] --> Grid_Connection[Grid Connection]
 Grid_Connection -.-> Utility_Interconnection[Utility Interconnection ⚠️ $1.2B]
 Hardware_Suppliers[Hardware Suppliers] --> Charger_Manufacturing[Charger Manufacturing ⚠️ $0.9B]
 Site_Owners[Site Owners] --> Land_Lease_Purchase[Land Lease / Purchase]
 Land_Lease_Purchase --> Permitting[Permitting ⚠️ $0.5B]
 Permitting --> Construction_Firms[Construction Firms]
 Construction_Firms --> Charging_Lounge_Build[Charging Lounge Build]
 Charger_Manufacturing --> Charging_Lounge_Build
 Utility_Interconnection --> Charging_Lounge_Build
 Charging_Lounge_Build --> Operations_Maintenance[Operations & Maintenance]
 Operations_Maintenance --> Fleet_Contracts[Fleet & Rideshare Contracts]
 Fleet_Contracts --> Drivers_Vehicles[Drivers & Vehicles Use]
 Drivers_Vehicles --> Payments_Data[Payments & Data Feedback] --> Operations_Maintenance
 Utility_Interconnection:::bottleneck
 Charger_Manufacturing:::bottleneck
 Permitting:::bottleneck
 classDef bottleneck fill:#ffcccc


Total Impact (USD): $7800M
Analysis Date: 2025-07-12 20:46:55
Model Version: o3-2024-12-17`
  },
  {
    id: "shared-spectrum-neutral-host",
    context: `Industry: Shared Spectrum & Neutral-Host Platforms

Definition: Platforms and services that enable dynamic or local licensing and multi-tenant neutral-host deployments

Market Size: $5.5 billion
Market Size (Billions): $5.5B
1-Year Growth: 21%
5-Year Growth: 26%

Key Drivers:
1. Regulatory frameworks for shared mid-band spectrum
2. Cost avoidance of exclusive spectrum auctions
3. Venue owners seeking multi-operator coverage

Trends:
1. Automated CBRS/5G NR-U spectrum access systems (Weight: 8.2, Type: tech)
2. National regulators opening localized 3–6 GHz bands (Weight: 7.9, Type: behavioral)
3. Multi-Operator Core Network support (Weight: 6.5, Type: tech)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Shared-spectrum and neutral-host networks let many mobile carriers share one set of radios inside offices, stadiums, and factories. Chip makers create radio chips and antennas. Equipment companies build small cells and cloud-based spectrum access systems that decide who can use each channel. Gear is shipped to system integrators, who must obtain spectrum certificates and building permits before installing radios and fiber backhaul on site. Venue owners sign service contracts; mobile operators plug their core networks into the shared gear. End users then enjoy normal cellular service while software platforms monitor performance and push updates.

Supply Chain Flow Chart:
flowchart LR
 Raw_Components[Raw Radio Chips & Antenna Metals] --> RF_Silicon_Fabs[RF Silicon Fabs ⚠️ $900M]
 RF_Silicon_Fabs --> Small_Cell_OEMs[Small-Cell & DAS Manufacturers]
 Software_Stacks[Cloud Spectrum Access Software] --> Small_Cell_OEMs
 Small_Cell_OEMs --> Logistics[Global Logistics]
 Logistics --> System_Integrators[System Integrators]
 Regulatory_Permits[Regulatory & Building Permits ⚠️ $650M] -.-> Onsite_Deployment
 System_Integrators --> Onsite_Deployment[On-Site Deployment Crews]
 Backhaul_Installation[Fiber Backhaul Installation ⚠️ $400M] -.-> Onsite_Deployment
 Onsite_Deployment --> MNO_Contracts[Multi-Operator Contracts]
 MNO_Contracts --> Venue_Operations[Venue Operations]
 Venue_Operations --> End_Users[Mobile Users]


Total Impact (USD): $3210M
Analysis Date: 2025-07-12 20:47:00
Model Version: o3-2024-12-17`
  },
  {
    id: "cloud-migration-modernization",
    context: `Industry: Cloud Migration & Modernization Services

Definition: Services that plan, refactor, migrate and modernize applications and data from on-premises or legacy environments into hybrid or multi-cloud architectures

Market Size: $16.9 billion
Market Size (Billions): $16.9B
1-Year Growth: 24%
5-Year Growth: 27.8%

Key Drivers:
1. Acceleration of digital transformation initiatives
2. Need to retire legacy data centers and monolithic applications
3. Cloud-native development enabling faster product cycles

Trends:
1. Automated discovery and refactoring using generative AI code assessment (Weight: 8.7, Type: tech)
2. Board-level mandates for capex-to-opex shift and sustainability reporting (Weight: 7.1, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Cloud migration and modernization firms help companies move old computer systems into new cloud homes. First, experts study the customer's software and data, then redesign or rewrite code so it can run on shared cloud servers from Amazon, Microsoft, Google or others. Data is copied over fast lines, security rules and legal approvals are checked, and a final cut-over swaps users to the new system. After launch, managed service teams watch and improve the cloud setup. Buyers are banks, retailers, governments and any business tired of running its own data centers.

Supply Chain Flow Chart:
flowchart LR
 Legacy_Workloads[Legacy Workloads] --> App_and_Data_Discovery[App & Data Discovery ⚠️ $1.5B]
 App_and_Data_Discovery --> Cloud_Readiness[Cloud Readiness]
 Cloud_Readiness --> Migration_Planning[Migration Planning]
 Migration_Planning --> Refactoring_Tools[Refactoring Tools ⚠️ $0.9B]
 Migration_Planning --> Data_Transfer_Pipelines[Data Transfer Pipelines ⚠️ $0.8B]
 Refactoring_Tools --> Cloud_Landing_Zones[Cloud Landing Zones]
 Data_Transfer_Pipelines --> Cloud_Landing_Zones
 Security_Compliance_Approval[Security & Compliance Approval ⚠️ $1.2B] -.-> Cloud_Landing_Zones
 Cloud_Landing_Zones --> Cutover_and_Testing[Cutover & Testing]
 Cutover_and_Testing --> Managed_Services[Managed Services]
 Managed_Services --> End_Users[End Users]


Total Impact (USD): $8100M
Analysis Date: 2025-07-12 20:56:09
Model Version: o3-2024-12-17`
  },
  {
    id: "edge-cloud-integration",
    context: `Industry: Edge-to-Cloud Integration Services

Definition: Implementation of architectures that extend cloud control planes to edge sites, integrating local compute, 5G, and IoT systems with centralized multi-cloud workloads

Market Size: $6.0 billion
Market Size (Billions): $6B
1-Year Growth: 30%
5-Year Growth: 31%

Key Drivers:
1. AI inference at the edge for real-time decisions
2. Private 5G deployments demanding unified orchestration
3. Industry 4.0 initiatives requiring deterministic low-latency processing

Trends:
1. Lightweight Kubernetes and WASM runtimes for edge nodes (Weight: 8.8, Type: tech)
2. Local-sovereign data processing mandates in manufacturing and healthcare (Weight: 7.2, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Edge-to-cloud integration services connect smart machines, local 5G networks, and tiny data-centers at factory floors or hospitals to big public clouds. Hardware makers build edge servers and radios; software firms create lightweight platforms that run on them. Integrators design the full system, ship gear to the customer site, win needed spectrum and data permits, and install everything. Secure links then let the local equipment talk to cloud control panels, where updates and analytics are managed. End users—manufacturers, telecom carriers, retailers, and hospitals—run real-time apps and get remote support while keeping critical data close by.

Supply Chain Flow Chart:
flowchart LR
 Silicon_Wafers[Semiconductor Wafers] --> Chip_Fabs[Chip Fabrication]
 Rare_Earth_Metals[Rare-Earth Metals] --> Chip_Fabs
 Chip_Fabs --> Edge_Processors[Edge Processors ⚠️ $1.4B]
 Sheet_Metal[Sheet Metal] --> Chassis_Plants[Server Chassis Plants]
 Edge_Processors --> OEM_Hardware_Plants[OEM Hardware Plants]
 Chassis_Plants --> OEM_Hardware_Plants
 OEM_Hardware_Plants --> Edge_Servers[Edge Servers]
 Antenna_Components[Antenna Components] --> Radio_Assembly[5G Radio Assembly ⚠️ $0.9B]
 Edge_Servers --> Logistics[Global Logistics]
 Radio_Assembly --> Logistics
 Logistics --> Site_Installation[Site Installation]
 Lightweight_K8s_WASM[Lightweight Kubernetes & WASM Runtime] --> Software_Stack[Software Stack]
 Software_Stack --> System_Integrators[System Integrators ⚠️ $1.2B]
 Data_Regulations[Data Regulations] -.-> Compliance_Permits[Compliance & Permits ⚠️ $1.0B]
 Compliance_Permits -.-> Site_Installation
 System_Integrators --> Site_Installation
 Site_Installation --> Edge_Sites[Edge Sites]
 Edge_Sites --> Cloud_Control_Plane[Cloud Control Plane]
 Cloud_Control_Plane --> Managed_Services[Managed Services]
 Managed_Services --> End_Users[Manufacturers, Hospitals, Retailers]
 Compliance_Permits:::bottleneck
 Edge_Processors:::bottleneck
 Radio_Assembly:::bottleneck
 System_Integrators:::bottleneck


Total Impact (USD): $5300M
Analysis Date: 2025-07-12 20:49:50
Model Version: o3-2024-12-17`
  },
  {
    id: "brand-ip-experience-centers",
    context: `Industry: Brand & IP Experience Centers

Definition: Permanent or semi-permanent indoor installations where consumer brands, sports leagues and entertainment franchises create interactive, story-driven environments to deepen fan engagement and drive merchandise sales

Market Size: $6.9 billion
Market Size (Billions): $6.9B
1-Year Growth: 24%
5-Year Growth: 28.6%

Key Drivers:
1. Brands reallocating media budgets to high-ROI experiential channels
2. Streaming franchises using physical spaces to reduce subscriber churn
3. Modular build-outs in vacant mall anchors lowering capex requirements
4. Data capture on visitor behavior informing cross-channel marketing

Trends:
1. Mixed-reality wearables delivering personalized story branches (Weight: 8.3, Type: tech)
2. Fans demanding 'canon' in-person lore extension between content releases (Weight: 7.1, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Brands, sports teams and movie studios build walk-through playgrounds where fans can touch, play and shop inside their favorite stories. Designers license the brand's characters, then craft sets, games and digital layers. Builders turn raw steel, screens and lights into themed rooms, ship them to empty mall spaces, secure local permits and wire up ticketing. Staff run shows, sell merchandise and collect data that feeds future marketing. Fans buy tickets, share photos and keep the brand top of mind.

Supply Chain Flow Chart:
flowchart LR
 Building_Materials_Electronics[Building Materials & Electronics] --> Fabrication_Shops[Prop & Set Fabrication]
 IP_Licenses[IP Licenses] -.-> Design_Studios[Creative & Software Design]
 Fabrication_Shops --> Assembly_Studios[Assembly Studios]
 MixedReality_Hardware⚠️_$550M[Mixed-Reality Hardware ⚠️ $550M] -.-> Assembly_Studios
 Design_Studios --> Assembly_Studios
 Assembly_Studios --> Logistics[Logistics & Shipping]
 Permits_Zoning⚠️_$370M[Permits & Zoning ⚠️ $370M] -.-> Venue_Buildout[On-Site Buildout]
 Logistics --> Venue_Buildout
 Skilled_Labor⚠️_$320M[Skilled Labor ⚠️ $320M] -.-> Venue_Buildout
 Venue_Buildout --> Operations_Ticketing[Operations & Ticketing]
 Operations_Ticketing --> Fans_Visitors[Fans & Visitors]
 Operations_Ticketing --> Data_Analytics[Data Analytics]
 Data_Analytics --> Cross_Channel_Marketing[Cross-Channel Marketing]
 Privacy_Regulations⚠️_$290M[Privacy Regulations ⚠️ $290M] -.-> Data_Analytics
 Branded_Merchandise[Branded Merchandise] --> Fans_Visitors


Total Impact (USD): $2010M
Analysis Date: 2025-07-12 20:55:54
Model Version: o3-2024-12-17`
  },
  {
    id: "freemium-cloud-gaming",
    context: `Industry: Freemium & Ad-Supported Cloud Gaming Platforms

Definition: Cloud gaming services that provide no-cost entry via advertising, limited play sessions, or mobile-carrier/ISP bundles, monetizing through ads, micro-transactions, and optional premium upgrades

Market Size: $5.2 billion
Market Size (Billions): $5.2B
1-Year Growth: 42%
5-Year Growth: 30%

Key Drivers:
1. Ad inventory sales to AAA publishers seeking trial exposure
2. 5G SA and Wi-Fi 7 roll-outs reducing latency for mobile users in emerging markets
3. Carrier and ISP zero-rating of game-stream traffic that boosts uptake
4. Edge POP deployments in tier-2/3 cities expanding addressable audience

Trends:
1. Dynamic streaming resolution adaptors maintaining QoE on congested networks (Weight: 8.3, Type: tech)
2. Playable ad formats converting casual mobile gamers to cloud sessions (Weight: 7, Type: behavioral)
3. Edge datacenter colocation with CDNs cutting round-trip latency below 25 ms (Weight: 7.8, Type: tech)
4. Hybrid monetization increasing LTV in price-sensitive regions (Weight: 6.6, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Cloud gaming lets people play high-end games on any phone, tablet, or TV without a console. Powerful servers in edge data centers run the game and stream video frames to the player, while the player's touches travel back. Most people start free and see ads, buy small in-game items, or later pay for upgrades. The chain starts with graphic chips, servers, fiber links, and cheap power. Builders add streaming software, ad tools, and game rights, then place the racks near carrier and broadband networks. Carriers route traffic, app stores send the client app, and support teams handle billing and help.

Supply Chain Flow Chart:
flowchart LR
 GPU_Chips[GPU Chips] --> Server_Assembly[Server Assembly ⚠️ $700M]
 Network_Fiber[Network Fiber] --> Edge_Datacenters[Edge Datacenters ⚠️ $520M]
 Electricity[Low-cost Power] --> Edge_Datacenters
 Server_Assembly --> Streaming_Platform_Software[Streaming Platform Software]
 Streaming_Platform_Software --> Game_Licensing[Game Licensing ⚠️ $450M]
 Game_Licensing --> Edge_Datacenters
 Ad_Tech_Platform[Ad Tech Platform] --> Streaming_Platform_Software
 Edge_Datacenters --> Carrier_ISP_Peering[Carrier & ISP Peering ⚠️ $380M]
 Carrier_ISP_Peering --> Live_Streams[Live Streams]
 Live_Streams --> App_Store_Clients[App Store Clients]
 App_Store_Clients --> Gamers[Gamers]
 Gamers --> Player_Support[Player Support]
 Regulatory_Approvals[Regulatory Approvals] -.-> Edge_Datacenters
 Regulatory_Approvals -.-> Game_Licensing


Total Impact (USD): $3740M
Analysis Date: 2025-07-12 20:54:48
Model Version: o3-2024-12-17`
  },
  {
    id: "xr-headsets-spatial-computing",
    context: `Industry: XR Headsets & Spatial-Computing Devices

Definition: Augmented-, virtual- and mixed-reality headsets and glasses for consumer and enterprise use

Market Size: $18.0 billion
Market Size (Billions): $18B
1-Year Growth: 28%
5-Year Growth: 35%

Key Drivers:
1. Launch of high-end mixed-reality headsets
2. Corporate training and collaboration demand
3. Growing developer ecosystem for spatial apps

Trends:
1. Micro-OLED pancake optics (Weight: 8.3, Type: tech)
2. Natural hand-, eye- and voice-tracking interfaces (Weight: 7.5, Type: tech)
3. Creator economy for spatial content (Weight: 6.1, Type: behavioral)
4. Remote collaboration adoption in enterprises (Weight: 6.8, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Extended-reality headsets feel like ski goggles or sleek glasses that blend digital images with the real world. Makers buy chips, tiny OLED screens, pancake lenses, batteries and housings, put them together in clean-room factories, load software, pass safety rules, then ship to stores and company tech buyers. Gamers, film fans, field technicians and office teams wear the devices to play, design or collaborate, while developers keep updating apps and cloud services.

Supply Chain Flow Chart:
flowchart LR
 Silicon_Wafers[Silicon Wafers] --> SOC_Foundries[SOC Foundries ⚠️ $2700M]
 Glass_Substrates[Glass Substrates] --> MicroOLED_Fabs[Micro-OLED Fabs ⚠️ $3200M]
 Optical_Glass[Optical Glass] --> Pancake_Lens_Manufacturing[Pancake Lens Manufacturing ⚠️ $1800M]
 Rare_Earth_Magnets[Rare Earth Magnets] --> Haptics_Components[Haptics Components]
 Lithium_Cobalt[Lithium & Cobalt] --> Battery_Cells[Battery Cells]
 SOC_Foundries --> Subassembly_Plants[Sub-assembly Plants]
 MicroOLED_Fabs --> Subassembly_Plants
 Pancake_Lens_Manufacturing --> Subassembly_Plants
 Haptics_Components --> Subassembly_Plants
 Battery_Cells --> Subassembly_Plants
 Subassembly_Plants --> Final_Assembly_Plants[Final Assembly Plants]
 Final_Assembly_Plants -.-> Regulatory_Compliance[Regulatory Compliance ⚠️ $1400M]
 Regulatory_Compliance -.-> Final_Assembly_Plants
 Final_Assembly_Plants --> Distribution_Centers[Distribution Centers]
 Distribution_Centers --> Retail_Ecommerce[Retail & E-commerce]
 Distribution_Centers --> Enterprise_Resellers[Enterprise IT Resellers]
 Retail_Ecommerce --> Consumers[Consumers]
 Enterprise_Resellers --> Enterprise_Users[Enterprise Users]
 Content_Development_Ecosystem[Content Development Ecosystem ⚠️ $2100M] -.-> Consumers
 Content_Development_Ecosystem -.-> Enterprise_Users


Total Impact (USD): $11200M
Analysis Date: 2025-07-12 20:55:41
Model Version: o3-2024-12-17`
  },
  {
    id: "hvo-marine-bunkering", 
    context: `Industry: HVO Marine Bunkering

Definition: Distribution of hydrotreated vegetable oil renewable diesel as a high-blend or neat drop-in substitute for conventional very-low-sulfur fuel oil

Market Size: $16.0 billion
Market Size (Billions): $16B
1-Year Growth: 38%
5-Year Growth: 28%

Key Drivers:
1. Surging renewable-diesel refinery capacity in North America and Singapore
2. Engine OEM approvals for 100 % HVO operation without derating
3. Long-term offtake deals from container-line eco-services

Trends:
1. Co-processing of lipid feedstocks in existing hydrocrackers lowering cost per ton (Weight: 8.6, Type: tech)
2. Cargo-owner willingness to pay green premiums for certified low-carbon voyages (Weight: 7.9, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
HVO marine bunkering supplies ships with renewable diesel made from used cooking oil, animal fats, and plant oils. Collectors gather these oils and send them to pre-treatment plants. Refineries add hydrogen to clean them up, creating a drop-in fuel that works in most modern engines. The finished HVO moves by pipeline, truck, or barge to special port tanks that keep it separate from regular fuel. After customs checks and sustainability certificates, bunkering barges pump the fuel into vessels. Ship owners then sail with lower carbon footprints, and fuel suppliers provide ongoing quality tests and engine support.

Supply Chain Flow Chart:
flowchart LR
 Feedstock_Collection[Feedstock Collection (waste oils, animal fats)] --> Pre_Treatment_Plants[Pre-Treatment Plants]
 Virgin_Oil_Crush[Virgin Oil Crush] --> Pre_Treatment_Plants
 Pre_Treatment_Plants --> HVO_Refineries[HVO Refineries ⚠️ $3 000 M]
 Regulatory_Certification[Regulatory Certification] -.-> HVO_Refineries
 HVO_Refineries --> Port_Terminals[Port Storage & Segregation ⚠️ $1 200 M]
 Pipeline_Trucking[Pipeline & Trucking] --> Port_Terminals
 Port_Terminals --> Bunkering_Barges[Bunkering Barges]
 Bunkering_Barges --> Vessel_Bunkering[Vessel Bunkering at Berth]
 Vessel_Bunkering --> Ship_Operators[Ship Operators / End Users]


Total Impact (USD): $12700M
Analysis Date: 2025-07-12 20:49:53
Model Version: o3-2024-12-17`
  },
  {
    id: "consumer-electric-pickup-trucks",
    context: `Industry: Consumer Full-Size Electric Pickup Trucks

Definition: Battery-electric full-size crew-cab pickups marketed primarily to retail consumers for personal transportation, towing, and recreation

Market Size: $11.5 billion
Market Size (Billions): $11.5B
1-Year Growth: 59%
5-Year Growth: 41%

Key Drivers:
1. Rapid model proliferation from major OEMs
2. Expansion of public 350-kW fast-charging corridors enabling long-distance towing
3. Lifestyle demand for high-performance off-road and adventure vehicles with zero tailpipe emissions

Trends:
1. Next-gen 4680‐class and high-nickel batteries delivering 500+ mile range (Weight: 9.2, Type: tech)
2. Bundled home energy storage and bidirectional charging packages (Weight: 7.9, Type: tech)
3. Consumer shift toward premium electrified trucks as status symbols (Weight: 7.3, Type: behavioral)
4. State ZEV sales mandates accelerating ICE pickup phase-outs (Weight: 6.8, Type: policy)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Electric pickup trucks start with mining lithium, nickel, iron, and silica. Refineries turn these into battery powders, steel, and computer chips. Battery plants press the powders into cells, while steel mills stamp body panels. Automakers bolt cells, motors, chips, and frames together, test each truck, then ship it by rail or car carrier to dealerships. Utilities and builders install high-power roadside chargers after winning city permits. Drivers buy the truck, plug in at home or on the road, tow and adventure, and return for software updates and service. If batteries, chips, or chargers arrive late, the whole chain slows.

Supply Chain Flow Chart:
flowchart LR
 Lithium_Nickel_Ore[Raw Metals and Minerals] --> Refining_Chemicals[Refining & Chemical Processing]
 Refining_Chemicals --> Battery_Cell_Factories[Battery Cell Factories ⚠️ $3.5B]
 Lithium_Nickel_Ore --> Steel_Mills[Steel Mills]
 Steel_Mills --> Body_Frame_Parts[Body & Frame Parts]
 Battery_Cell_Factories --> Pack_Assembly[Battery Pack Assembly]
 Semiconductor_Fabs[Semiconductor Fabs ⚠️ $1.8B] -.-> Vehicle_Assembly[Vehicle Assembly ⚠️ $2.0B]
 Pack_Assembly --> Vehicle_Assembly
 Body_Frame_Parts --> Vehicle_Assembly
 Vehicle_Assembly --> Quality_Testing[Quality Testing]
 Quality_Testing --> Finished_Trucks[Finished Trucks]
 Finished_Trucks --> Rail_Truck_Logistics[Rail & Truck Logistics]
 Rail_Truck_Logistics --> Dealerships[Dealerships]
 Dealerships --> Consumers[Consumers]
 Public_Charging_Permitting[Public Charging Permitting ⚠️ $2.2B] -.-> Fast_Charging_Deployment[Fast Charging Deployment]
 Fast_Charging_Deployment --> Consumers


Total Impact (USD): $12900M
Analysis Date: 2025-07-12 20:55:28
Model Version: o3-2024-12-17`
  },
  {
    id: "rpm-software-platforms",
    context: `Industry: RPM Software Platforms & Analytics

Definition: Cloud dashboards, data aggregation engines and AI analytics that ingest device data, flag out-of-range values and integrate into EHR and care-coordination workflows.

Market Size: $5.5 billion
Market Size (Billions): $5.5B
1-Year Growth: 30.4%
5-Year Growth: 25.3%

Key Drivers:
1. Mandatory quality-reporting metrics requiring longitudinal data capture
2. Provider demand for workflow-integrated alert triage tools to reduce alarm fatigue
3. API-based data liquidity under US Cures Act and global FHIR mandates

Trends:
1. Predictive algorithms for early decompensation detection (Weight: 9, Type: tech)
2. Hospital-at-home reimbursement expansion (Weight: 6.5, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Remote patient-monitoring (RPM) software pulls readings from home devices like blood-pressure cuffs into cloud dashboards. Incoming numbers are cleaned and stored, then algorithms watch for dangerous swings and push alerts into the electronic health record that doctors already use. Hospitals, home-health groups and insurers buy these tools to track patients between visits and earn new care payments. The chain starts with sensor makers who stream data to cloud servers. Data engines tidy the feed and share it using FHIR health data rules. Analytics teams build AI that spots risk. Regulatory staff secure clearance and privacy checks. Integrators bolt alerts into clinical systems, care teams act, and support staff coach patients.

Supply Chain Flow Chart:
flowchart LR
 Sensor_Device_OEMs[Sensor Device OEMs] --> Data_Ingestion_Engines[Data Ingestion Engines]
 Cloud_Hosting_Infrastructure[Cloud Hosting Infrastructure] --> Data_Ingestion_Engines
 Data_Ingestion_Engines --> FHIR_APIs[FHIR APIs]
 FHIR_APIs -.-> EHR_Integration_Layer[EHR Integration Layer ⚠️ $750M]
 AI_Analytics_Platform[AI Analytics Platform ⚠️ $820M] --> EHR_Integration_Layer
 Regulatory_Compliance[Regulatory Compliance ⚠️ $740M] -.-> AI_Analytics_Platform
 EHR_Integration_Layer --> Provider_Deployment[Provider Deployment Teams]
 Provider_Deployment --> Patient_Engagement_Support[Patient Engagement & Support]
 Patient_Engagement_Support --> Health_Outcomes[Improved Health Outcomes]

 EHR_Integration_Layer:::bottleneck
 AI_Analytics_Platform:::bottleneck
 Regulatory_Compliance:::bottleneck


Total Impact (USD): $3460M
Analysis Date: 2025-07-12 20:47:34
Model Version: o3-2024-12-17`
  },
  {
    id: "dual-incretin-therapies",
    context: `Industry: Dual Incretin Therapies

Definition: Peptide drugs simultaneously activating GLP-1 and GIP receptors to deliver superior glucose and weight reduction for diabetes and obesity

Market Size: $12.0 billion
Market Size (Billions): $12B
1-Year Growth: 80%
5-Year Growth: 35%

Key Drivers:
1. Superior efficacy versus GLP-1 mono-agonists driving rapid physician uptake
2. Pending obesity indications expected to double eligible patient pool
3. Positive cardiovascular-outcome trials expanding payer formulary preference

Trends:
1. Engineered peptides with tunable half-life for flexible dosing (Weight: 9.3, Type: tech)
2. Formulary competition favoring cost-effective high-potency options (Weight: 7.5, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Dual incretin therapies are injectable drugs that copy two natural gut hormones so the body releases less sugar and burns more fat. Chemical companies sell purified amino acids and special reagents to peptide plants that stitch the pieces together. Contract drug makers purify, fill, and package the liquid medicine in pens, then move it by refrigerated trucks to wholesalers. Regulators must clear every batch and new use. Health insurers bargain over price before pharmacies and clinics hand the pens to people with diabetes or obesity, who are trained to self-inject and return for dose checks.

Supply Chain Flow Chart:
flowchart LR
 Raw_Amino_Acids[Raw Amino Acids] --> Peptide_Synthesis_Plants[Peptide Synthesis Plants ⚠️ $900M]
 Specialty_Chemicals[Specialty Chemicals] --> Peptide_Synthesis_Plants
 Peptide_Synthesis_Plants --> Contract_Manufacturers[Contract Manufacturers]
 Contract_Manufacturers --> Fill_Finish_Sites[Fill-Finish Sites]
 Fill_Finish_Sites --> Cold_Chain_Logistics[Cold Chain Logistics ⚠️ $500M]
 Regulatory_Approvals[Regulatory Approvals ⚠️ $1300M] -.-> Fill_Finish_Sites
 Cold_Chain_Logistics --> Wholesalers[Wholesalers]
 Payer_Negotiations[Payer Negotiations ⚠️ $2000M] -.-> Wholesalers
 Wholesalers --> Pharmacies_Clinics[Pharmacies & Clinics]
 Pharmacies_Clinics --> Patients_Providers[Patients & Providers]


Total Impact (USD): $5300M
Analysis Date: 2025-07-12 20:48:34
Model Version: o3-2024-12-17`
  },
  {
    id: "enterprise-ar-mixed-reality",
    context: `Industry: Enterprise AR & Mixed Reality Headsets

Definition: Wearable augmented- and mixed-reality headsets and smart glasses deployed by businesses for field service, manufacturing, healthcare, defense, and training use cases

Market Size: $6.5 billion
Market Size (Billions): $6.5B
1-Year Growth: 28.9%
5-Year Growth: 30.7%

Key Drivers:
1. Cost savings from remote assistance and hands-free workflows accelerating ROI justification
2. Digital-twin and industrial metaverse investments requiring spatial visualization hardware
3. Defense, healthcare, and telecom capex earmarked for immersive training and maintenance solutions

Trends:
1. AI-powered object recognition and real-time translation embedded on-device (Weight: 8.7, Type: tech)
2. Workforce upskilling mandates and safety regulations encouraging hands-free AR adoption (Weight: 7.4, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Businesses give technicians and trainees smart headsets that layer digital instructions and 3-D images over what they see so jobs get done faster and with fewer errors. Hardware makers buy glass, silicon chips, cameras, and batteries, turn them into tiny displays and light-guiding lenses, then assemble rugged headsets. The finished units are shipped by air or sea, tested for safety and wireless rules, and installed by system integrators who load company software and connect to cloud management tools. Workers then use the headsets hands-free on factory floors, oil rigs, hospitals, or bases while IT teams update firmware and replace worn parts.

Supply Chain Flow Chart:
flowchart LR
 Rare_Earth_Metals[Rare Earth Metals] --> Display_Fabs[Microdisplay Fabs ⚠️ $420M]
 Silicon_Wafers[Silicon Wafers] --> Display_Fabs
 Glass_Substrates[Glass Substrates] --> Waveguide_Optics_Fab[Waveguide Optics Fab ⚠️ $380M]
 Sensor_Foundries[Sensor Chip Foundries ⚠️ $310M] --> Final_Assembly[Headset Assembly]
 Battery_Cell_Manufacturing[Battery Cell Manufacturing ⚠️ $275M] --> Final_Assembly
 Display_Fabs --> Final_Assembly
 Waveguide_Optics_Fab --> Final_Assembly
 Final_Assembly --> Quality_Reg_Cert[Quality & Regulatory Certification ⚠️ $150M]
 Quality_Reg_Cert -.-> Export_Controls[Export Controls]
 Quality_Reg_Cert --> Distribution[Global Distribution]
 Distribution --> Systems_Integrators[Systems Integrators]
 Systems_Integrators --> Enterprise_Users[Enterprise Users]


Total Impact (USD): $1535M
Analysis Date: 2025-07-12 20:47:42
Model Version: o3-2024-12-17`
  },
  {
    id: "gpu-based-ai-accelerators",
    context: `Industry: GPU-based AI Accelerators

Definition: Graphics processing units engineered for large-scale AI training and inference workloads in hyperscale and enterprise data centers

Market Size: $20.0 billion
Market Size (Billions): $20B
1-Year Growth: 30%
5-Year Growth: 28%

Key Drivers:
1. Ramp of NVIDIA Blackwell and AMD MI300 series
2. Demand for multi-GPU clusters to train next-gen frontier models
3. Expansion of GPU-as-a-Service capacity by cloud providers

Trends:
1. Integration of HBM4 and advanced 2.5D/3D CoWoS packaging (Weight: 9.2, Type: tech)
2. Enterprises shifting from capex purchases to rented GPU cloud instances (Weight: 7, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
GPUs for artificial intelligence start as pure silicon sliced into wafers, which are printed with billions of tiny circuits in advanced chip factories. High-speed HBM memory dies are made in parallel. Both parts are stacked together in special 3-D packages, soldered onto circuit boards, tested, and shipped to server makers. Cloud companies install the boards in power-hungry racks, load driver software, and rent the finished clusters by the hour to startups, researchers, and large firms that train and run big AI models.

Supply Chain Flow Chart:
flowchart LR
 Raw_Materials[Raw Materials] --> Wafer_Fabs[Advanced_Wafer_Fabs ⚠️ $8B]
 Raw_Materials --> Memory_Fabs[HBM_Memory_Fabs ⚠️ $5.5B]
 Wafer_Fabs --> Advanced_Packaging[2.5D_3D_Packaging ⚠️ $4B]
 Memory_Fabs --> Advanced_Packaging
 Advanced_Packaging --> Board_Assembly[Board_Assembly]
 Board_Assembly --> Quality_Testing[Quality_Testing]
 Quality_Testing --> Distribution_Logistics[Distribution_Logistics]
 Distribution_Logistics --> Data_Center_Integration[Data_Center_Integration ⚠️ $3B]
 Data_Center_Integration --> Cloud_Services[Cloud_GPU_Services]
 Cloud_Services --> Enterprise_Users[Enterprise_and_AI_Labs]
 Export_Controls[Export_Controls ⚠️ $2.5B] -.-> Distribution_Logistics

 Wafer_Fabs:::bottleneck
 Memory_Fabs:::bottleneck
 Advanced_Packaging:::bottleneck
 Data_Center_Integration:::bottleneck
 Export_Controls:::bottleneck


Total Impact (USD): $23000M
Analysis Date: 2025-07-12 20:55:09
Model Version: o3-2024-12-17`
  },
  {
    id: "generative-ai-systems-integration",
    context: `Industry: Generative AI Systems Integration

Definition: Customization, fine-tuning, and embedding of large language and multimodal models into business workflows and products

Market Size: $12.8 billion
Market Size (Billions): $12.8B
1-Year Growth: 32%
5-Year Growth: 28%

Key Drivers:
1. C-suite demand to monetize generative AI use-cases
2. Proliferation of open-source and proprietary foundation models
3. Vendor ecosystem funding for enterprise GenAI pilots

Trends:
1. Retrieval-augmented generation with vector databases (Weight: 9.3, Type: tech)
2. Workforce upskilling for prompt engineering (Weight: 7, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Generative AI integration turns existing foundation models into purpose-built helpers for business. Firms gather internal and public data, clean it, and combine it with a pretrained model. Engineers fine-tune or "prompt-program" the model on rented graphics-chip servers, test outputs, and pass audits for privacy and safety rules. The finished model and a vector database are packaged into cloud services or on-site servers, wired into chatbots, search bars, or software features, and released to employees or customers. Ongoing support teams watch costs, tune prompts, and retrain with new data. Buyers are chief technology officers, product managers, and line-of-business leaders who need faster writing, coding, and analytics inside their everyday tools.

Supply Chain Flow Chart:
flowchart LR
 Raw_Datasets[Raw Datasets] --> Data_Engineering[Data Engineering ⚠️ $3.0B]
 Proprietary_Data[Proprietary Data] --> Data_Engineering
 Data_Engineering --> Vector_Databases[Vector Databases]
 Pretrained_Models[Pretrained Models] --> Fine_Tuning[Fine Tuning ⚠️ $2.0B]
 GPU_Supply[GPU Supply ⚠️ $2.0B] -.-> Fine_Tuning
 Fine_Tuning --> Model_Evaluation[Model Evaluation]
 Model_Evaluation -.-> Compliance_Review[Compliance Review ⚠️ $1.5B]
 Model_Evaluation --> Deployment_Pipeline[Deployment Pipeline]
 Vector_Databases --> Deployment_Pipeline
 Deployment_Pipeline --> Enterprise_Applications[Enterprise Applications]
 Enterprise_Applications --> End_Users[End Users]
 Support_Teams[Support Teams] --> End_Users


Total Impact (USD): $8200M
Analysis Date: 2025-07-12 20:49:52
Model Version: o3-2024-12-17`
  },
  {
    id: "hydrogen-fuel-cell-trucks",
    context: `Industry: Hydrogen Fuel-Cell Heavy-Duty Truck Manufacturing

Definition: Production of Class 7–8 trucks that couple fuel-cell stacks with compressed green hydrogen storage for extended-range long-haul freight applications

Market Size: $8.0 billion
Market Size (Billions): $8B
1-Year Growth: 34%
5-Year Growth: 32%

Key Drivers:
1. Expansion of subsidized green hydrogen hubs and highway refueling stations lowering fuel price toward $4-5 /kg
2. Government purchase incentives narrowing upfront vehicle price differential
3. Superior range and faster refuel times for payload-sensitive long-haul routes attracting early fleet conversions

Trends:
1. High-power membrane and high-pressure tank innovations boosting vehicle range (Weight: 8.2, Type: tech)
2. Corporate Scope 3 decarbonization targets pushing OEM–shipper hydrogen vehicle pilots (Weight: 6.7, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
These trucks work like electric rigs that make their own power on the road. A fuel-cell stack mixes stored green hydrogen with air to create electricity that drives the wheels, with only water vapor coming out. Freight carriers, supermarket chains, and parcel companies buy the trucks to cut diesel use on long routes and meet clean-air rules. The chain starts with renewable power splitting water to make hydrogen, plus mines that supply platinum and carbon fiber. Plants turn these into fuel-cell stacks and high-pressure tanks, which join chassis and electronics in truck factories. Finished trucks must pass safety tests, receive road permits, and rely on tanker or pipeline hydrogen that is delivered to highway refueling stations. Fleets then run, refuel, and service the trucks through dealer networks.

Supply Chain Flow Chart:
flowchart LR
 Green_Hydrogen_Production[Green Hydrogen Production ⚠️ $3200M] --> Hydrogen_Distribution_Logistics[Hydrogen Distribution Logistics] --> Highway_Refueling_Stations[Highway Refueling Stations ⚠️ $2100M] --> Fleet_Operators[Fleet Operators]
 Platinum_Group_Metals[Platinum Group Metals] --> Fuel_Cell_Stack_Manufacturing[Fuel Cell Stack Manufacturing ⚠️ $1400M] --> Truck_Assembly_Plant[Truck Assembly Plant]
 Carbon_Fiber[Carbon Fiber] --> High_Pressure_Tank_Fabrication[High Pressure Tank Fabrication ⚠️ $1000M] --> Truck_Assembly_Plant
 Chassis_and_Electronics[Chassis and Electronics] --> Truck_Assembly_Plant
 Truck_Assembly_Plant --> Fleet_Operators
 Truck_Assembly_Plant --> Regulatory_Certification[Regulatory Certification] -.-> Highway_Refueling_Stations
 Fleet_Operators --> Service_and_Parts_Support[Service and Parts Support ⚠️ $800M]


Total Impact (USD): $8500M
Analysis Date: 2025-07-12 20:53:04
Model Version: o3-2024-12-17`
  },
  {
    id: "battery-electric-heavy-trucks",
    context: `Industry: Battery-Electric Heavy-Duty Trucks

Definition: Manufacture of battery-electric heavy trucks, including fast-charge and battery-swap models for mining, steel and port logistics fleets

Market Size: $8.1 billion
Market Size (Billions): $8.1B
1-Year Growth: 38%
5-Year Growth: 27%

Key Drivers:
1. Central and municipal purchase subsidies plus NEV credit trading revenues
2. Rapid build-out of battery-swap stations reducing downtime for high-utilization fleets
3. Corporate decarbonization targets among logistics and industrial customers

Trends:
1. Declining LFP battery cost and energy density improvements (Weight: 9, Type: tech)
2. Zero-emission zones around ports, urban logistics hubs and mining sites (Weight: 8, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Electric heavy trucks start with mining lithium, iron and other metals that are refined into battery cells. Cell makers build large packs that bolt onto a truck chassis fitted with electric motors, axles and power electronics. Builders then test, certify and ship trucks to dealers or direct to industrial fleet buyers. Separate firms construct fast-charge or battery-swap stations and connect them to the power grid, often needing permits and utility upgrades. Fleet managers buy the trucks, sign service contracts and dispatch them in mines, steel mills and ports. After use, packs are refurbished or recycled and parts are serviced.

Supply Chain Flow Chart:
flowchart LR
 Raw_Minerals_Lithium[Raw Minerals: Lithium] --> Refining[Refining ⚠️ $500M]
 Raw_Minerals_Iron[Raw Minerals: Iron Phosphate] --> Refining
 Refining --> Cell_Manufacturing[Cell Manufacturing ⚠️ $600M]
 Component_Suppliers[Chassis & Motor Components] --> Truck_Assembly[Truck Assembly ⚠️ $400M]
 Cell_Manufacturing --> Battery_Packs[Battery Packs]
 Battery_Packs --> Truck_Assembly
 Regulatory_Compliance[Regulatory Compliance & Testing] -.-> Truck_Assembly
 Truck_Assembly --> Distribution[Distribution & Delivery]
 Distribution --> Fleet_Owners[Fleet Owners]
 Charging_Infrastructure[Charging & Battery Swap Stations ⚠️ $350M] -.-> Fleet_Owners
 Fleet_Owners --> Service_Recycling[Service, Parts & Recycling]


Total Impact (USD): $5100M
Analysis Date: 2025-07-12 20:52:39
Model Version: o3-2024-12-17`
  },
  {
    id: "edge-ai-accelerators-vision",
    context: `Industry: Edge AI Accelerators for Vision

Definition: Specialized chips, boards and embedded boxes that run deep-learning vision inference locally on cameras, robots and industrial equipment without reliance on data-center GPUs

Market Size: $7.7 billion
Market Size (Billions): $7.7B
1-Year Growth: 31%
5-Year Growth: 30.8%

Key Drivers:
1. Proliferation of high-resolution cameras in industrial and retail IoT endpoints
2. Need for sub-50 ms inference in safety-critical autonomous machines
3. Advances to 5 nm/3 nm NPUs reducing cost per TOPS

Trends:
1. Domain-specific vision NPUs integrated into ARM and RISC-V SoCs (Weight: 8.9, Type: tech)
2. Open-source quantization and sparsity techniques enabling 4-bit edge inference (Weight: 7.6, Type: tech)
3. Data-sovereignty regulations pushing processing to on-prem devices (Weight: 7.4, Type: behavioral)
4. Energy-efficiency mandates favoring on-device AI over cloud compute (Weight: 6.8, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Edge AI vision accelerators are tiny computers that let cameras, robots and factory machines understand images instantly without sending data to the cloud. Chip designers buy raw silicon wafers and rare-earth metals, then contract advanced foundries to etch neural-processing cores. After packaging and testing, boards or fan-less boxes are built and flashed with vision software. Products must pass safety and radio rules before distributors ship them to camera makers, robot builders or plant integrators. Once installed, the devices run live video analytics in under 50 milliseconds and receive secure software updates for years.

Supply Chain Flow Chart:
flowchart LR
 Raw_Silicon_Wafers[Raw Silicon Wafers] --> Advanced_Node_Foundries[Advanced Node Foundries ⚠️ $0.95B]
 Rare_Earth_Materials[Rare Earth Materials] -.-> Advanced_Node_Foundries
 IP_Design_Houses[IP Design Houses] --> Advanced_Node_Foundries
 Advanced_Node_Foundries --> Package_Test[Package & Test ⚠️ $0.52B]
 Package_Test --> Board_Assembly[Board Assembly]
 Board_Assembly --> Firmware_Stack_Dev[Firmware & Vision Stack Dev ⚠️ $0.40B]
 Firmware_Stack_Dev --> Compliance_Certifications[Compliance Certifications ⚠️ $0.35B]
 Compliance_Certifications --> Distributors[Distributors]
 Distributors --> OEM_Integrators[OEM Integrators]
 OEM_Integrators --> Deployment_on_Equipment[Deployment on Equipment]
 Deployment_on_Equipment --> Field_Support[Field Support]
 Field_Support -->|updates| Firmware_Stack_Dev


Total Impact (USD): $2700M
Analysis Date: 2025-07-12 20:55:30
Model Version: o3-2024-12-17`
  },
  {
    id: "edge-cdn-media-delivery",
    context: `Industry: Edge CDN & Media Delivery

Definition: Ultra-low-latency content delivery, transcoding and regional caching services that leverage telco edge nodes for streaming video, cloud gaming and real-time interactive media

Market Size: $5.5 billion
Market Size (Billions): $5.5B
1-Year Growth: 22%
5-Year Growth: 28%

Key Drivers:
1. Explosion of 8K/VR live events requiring processing closer to end-users
2. Federated edge-CDN alliances that pool multi-operator footprints
3. Bundling of edge CDN with 5G mobile broadband plans

Trends:
1. Adoption of HTTP/3 and QUIC transport optimised for high-throughput edge paths (Weight: 8.3, Type: tech)
2. Consumer willingness to pay premiums for lag-free live sports and esports streams (Weight: 6.9, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Edge content delivery networks put small stacks of powerful servers inside telephone company buildings and at base stations, so movies, games and live events travel only a short distance to phones and televisions. Equipment makers first buy chips, fiber links and metal cases, then build special edge servers and video cards. The hardware is trucked to telecom sites, where owners must get city permits and connect to high-speed fiber and fifth generation mobile signals. Software firms load caching and transcoding programs, and streaming platforms rent this capacity so their viewers get smooth pictures with almost no delay. Support teams monitor traffic and swap failed parts quickly.

Supply Chain Flow Chart:
flowchart LR
 Semiconductor_Fabs[Semiconductor Fabs] --> Graphics_Chips[Graphics Chips]
 Metal_Chassis_Suppliers[Metal Chassis Suppliers] --> Edge_Server_Builders[Edge Server Builders]
 Graphics_Chips --> Edge_Server_Builders
 Fiber_Cable_Makers[Fiber Cable Makers] --> Telco_Backhaul[Telecom Backhaul]
 Edge_Server_Builders --> Shipping_Logistics[Shipping Logistics]
 Shipping_Logistics --> Telco_Edge_Sites[Telecom Edge Sites ⚠️ $450M]
 Telco_Backhaul -.-> Telco_Edge_Sites
 Site_Permits[Site Permits ⚠️ $300M] -.-> Telco_Edge_Sites
 Telco_Edge_Sites --> Software_Deployment[Content Delivery Software]
 Software_Deployment --> Content_Platforms[Streaming and Gaming Platforms]
 Content_Platforms --> Internet_Service_Providers[Internet Service Providers]
 Internet_Service_Providers --> End_Users[End Users]
 Federated_Peering[Federated Peering Agreements ⚠️ $250M] -.-> Content_Platforms


Total Impact (USD): $2770M
Analysis Date: 2025-07-12 20:51:31
Model Version: o3-2024-12-17`
  },
  {
    id: "onsite-mobility-energy",
    context: `Industry: On-site Mobility Energy

Definition: Electric-vehicle fast charging, hydrogen refueling, and related energy services installed at branded oil-major forecourts

Market Size: $10.0 billion
Market Size (Billions): $10B
1-Year Growth: 35%
5-Year Growth: 26%

Key Drivers:
1. Rapid build-out of high-power DC charging corridors
2. Government incentives and mandates for zero-emission infrastructure
3. Bundled energy subscriptions through oil-major mobility apps

Trends:
1. Vehicle-to-grid integration and smart load balancing (Weight: 8.6, Type: tech)
2. Aggressive national zero-emission vehicle targets accelerating charger demand (Weight: 8.1, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
On-site mobility energy means putting very fast electric chargers and hydrogen pumps right where people already fill up—at big oil company gas stations. Power or hydrogen is made or bought, heavy equipment is built, sites get wired, tested, and approved, then drivers tap an app and charge or refuel in minutes. The chain starts with raw electricity or natural gas, moves through electrolyzers and charger factories, travels by wires, pipes, or trucks to roadside stations, and ends with fleets and everyday drivers. After refueling, remote support keeps equipment running and bills customers automatically.

Supply Chain Flow Chart:
flowchart LR
 Renewable_Electricity[Renewable Electricity] --> Grid_Power[Grid Power]
 Natural_Gas[Natural Gas] --> Electrolyzer_Plant[Electrolyzer Plant]
 Renewable_Electricity --> Electrolyzer_Plant
 Electrolyzer_Plant --> Hydrogen_Logistics[Hydrogen Logistics]
 Hydrogen_Logistics --> Oil_Major_Forecourt[Oil Major Forecourt]
 Grid_Power --> Utility_Interconnection_bottleneck[Utility Interconnection ⚠️ $1.2B]:::bottleneck
 Utility_Interconnection_bottleneck -.-> Oil_Major_Forecourt
 Charger_OEMs[Charger OEMs] --> Fast_DC_Chargers[Fast DC Chargers]
 Compressor_Packagers[Compressor Packagers] --> Hydrogen_Dispensers[Hydrogen Dispensers]
 Fast_DC_Chargers --> Installation_Contractors[Installation Contractors]
 Hydrogen_Dispensers --> Installation_Contractors
 Installation_Contractors --> Permitting_Agencies_bottleneck[Permitting Agencies ⚠️ $0.6B]:::bottleneck
 Permitting_Agencies_bottleneck -.-> Oil_Major_Forecourt
 Oil_Major_Forecourt --> Mobility_Apps[Mobility Apps]
 Mobility_Apps --> Fleet_Customers[Fleet Customers]
 Mobility_Apps --> Retail_Drivers[Retail Drivers]
 Oil_Major_Forecourt --> After_Sales_Service[After Sales Service]


Total Impact (USD): $3700M
Analysis Date: 2025-07-12 20:51:01
Model Version: o3-2024-12-17`
  },
  {
    id: "north-american-compact-crossover-bevs",
    context: `Industry: North American Compact Crossover BEVs

Definition: Battery-electric C-segment crossover/SUV models under $40,000 MSRP sold in the United States and Canada

Market Size: $18.0 billion
Market Size (Billions): $18B
1-Year Growth: 35%
5-Year Growth: 30%

Key Drivers:
1. Inflation Reduction Act consumer tax credits for domestically assembled BEVs
2. Universal shift to NACS fast-charging standard improving network access
3. Automaker platform consolidation lowering bill of materials below $30k

Trends:
1. 4680/46105 cylindrical cells enabling structural-pack designs (Weight: 8.9, Type: tech)
2. Rising gasoline prices and state ZEV sales mandates (Weight: 8.1, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Compact electric crossovers start with lithium, nickel and other metals dug from mines. Refiners turn the minerals into powders that become battery electrodes, which are packed into large round cells. Cell rows form a strong battery pack that doubles as the car floor. Motors, power electronics and body parts are added on North American assembly lines. Finished vehicles travel by rail or truck to dealers or direct-sale hubs, where federal and provincial rebates cut the price. Buyers charge mostly at home but count on a growing NACS fast-charger network for trips. Automakers update software over the air and keep trained technicians and spare parts ready for repairs.

Supply Chain Flow Chart:
flowchart LR
 Lithium_Mining[Battery‐grade Lithium Mining ⚠️ $1.2B] --> Cathode_Processing[Cathode/Anode Processing ⚠️ $0.9B]
 Nickel_Cobalt_Mining[Nickel and Cobalt Mining] --> Cathode_Processing
 Cathode_Processing --> 4680_Cell_Production[4680 Cell Production ⚠️ $1.5B]
 4680_Cell_Production --> Battery_Pack_Assembly[Structural Pack Assembly]
 Battery_Pack_Assembly --> Vehicle_Assembly[Vehicle Assembly]
 Electric_Motors[Electric Motor and Inverter Suppliers] --> Vehicle_Assembly
 Vehicle_Assembly --> Distribution_Centers[OEM Distribution Centers]
 Distribution_Centers --> Dealers[Dealers/Direct Sales]
 Dealers --> Customers[Drivers]
 Vehicle_Assembly --> Fast_Charging_Deployment[Fast Charger Deployment ⚠️ $0.8B]
 Fast_Charging_Deployment -.-> Customers
 EV_Service_Techs[Skilled EV Service Techs ⚠️ $0.4B] -.-> Customers


Total Impact (USD): $4800M
Analysis Date: 2025-07-12 20:55:18
Model Version: o3-2024-12-17`
  },
  {
    id: "conversational-analytics-nlq-bi",
    context: `Industry: Conversational Analytics & NLQ BI SaaS

Definition: Platforms that let business users query data in natural language and receive AI-generated explanations, scenario simulations, and recommended actions without writing SQL or code

Market Size: $6.0 billion
Market Size (Billions): $6B
1-Year Growth: 23.5%
5-Year Growth: 27%

Key Drivers:
1. Adoption of GenAI chatbots inside collaboration tools for instant data answers
2. Contact-center, sales, and marketing teams demanding voice-of-customer analytics at scale
3. Lower licensing barriers through usage-based APIs for NLQ queries

Trends:
1. Multimodal large language models that combine text, voice, and images in analytic workflows (Weight: 9, Type: tech)
2. Shift toward conversational interfaces for frontline decision-making in field operations (Weight: 7.8, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Conversational analytics software lets people ask business questions in everyday language and instantly see answers, simulations, and suggested actions without writing code. Buyers are sales, marketing, service, and field teams that need quick insight during daily work. The chain starts with cloud chips and huge text-and-voice data that are cleaned and used to train large language models. Companies fine-tune the models, build secure software, and run it on public clouds. After security checks and contract reviews, integrators connect the service to company data stores. Employees then chat with the tool, while vendors watch performance and give support.

Supply Chain Flow Chart:
flowchart LR
 Cloud_GPUs_CPUs[Cloud GPUs & CPUs] --> Model_Training[Foundation model training ⚠️ $700M]
 Open_Voice_Text_Data[Open & licensed text/voice data] --> Model_Training
 Model_Training --> Fine_Tuning[Domain fine-tuning]
 Fine_Tuning --> SaaS_Platform_Development[SaaS platform development]
 Security_Compliance[Security & compliance reviews] -.-> SaaS_Platform_Development
 SaaS_Platform_Development --> Cloud_Hosting_DevOps[Cloud hosting & DevOps ⚠️ $400M]
 Cloud_Hosting_DevOps --> Integration_APIs[Integration APIs ⚠️ $300M]
 Legacy_Data_Pipelines[Legacy data pipelines] -.-> Integration_APIs
 Integration_APIs --> Marketplace_Contracts[Marketplace & contracts]
 Marketplace_Contracts --> End_Users_Support[End users & support]


Total Impact (USD): $6900M
Analysis Date: 2025-07-12 20:48:13
Model Version: o3-2024-12-17`
  },
  {
    id: "integrated-electric-axles",
    context: `Industry: Integrated Electric Axles

Definition: Modular axle systems that integrate electric motor, reduction gear, differential and power electronics into a single drive unit for battery-electric and hybrid vehicles

Market Size: $14.8 billion
Market Size (Billions): $14.8B
1-Year Growth: 32%
5-Year Growth: 37%

Key Drivers:
1. Rapid adoption of battery-electric vehicles across China, Europe and North America
2. OEM push to reduce drivetrain cost and packaging by integrating motor, gearbox and inverter
3. Government zero-emission mandates accelerating e-axle penetration in light and medium commercial vehicles
4. Investment by Tier-1 suppliers into scalable 800-volt e-axle platforms for high-performance applications

Trends:
1. Shift from silicon to silicon-carbide inverters inside e-axles for higher efficiency (Weight: 9.2, Type: tech)
2. Stringent 2030–2040 zero-emission vehicle regulations in major markets (Weight: 8.8, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Integrated electric axles are self-contained drive units that slide into a battery car much like a Lego block. Miners dig rare-earth metals, copper, steel and silicon. Materials are refined into magnets, windings, gears and power chips. Tier-1 suppliers press magnets, cut gears, print silicon-carbide wafers and assemble motors, gearboxes and inverters into one sealed axle. Each axle is tested, certified and shipped to vehicle plants, where car makers bolt it to the chassis, add wheels and battery, then send finished vehicles to dealers and fleet buyers. Drivers enjoy quiet, efficient power while repair shops handle software updates and bearing or coolant service.

Supply Chain Flow Chart:
flowchart LR
 Raw_Materials_REE[Raw Rare Earth Elements] --> Magnet_Manufacturing[Magnet Manufacturing ⚠️ $1500M]
 Raw_Materials_SiC[Silicon Carbide Powder] --> Wafer_Fabrication[SiC Wafer Fabrication ⚠️ $2000M]
 Steel_Aluminum[Steel and Aluminum] --> Gearbox_Casing_Casting[Gearbox Casing Casting]
 Copper_Wire[Copper Wire] --> Motor_Winding[Motor Winding]
 Magnet_Manufacturing --> Motor_Assembly[Motor Assembly]
 Motor_Winding --> Motor_Assembly
 Gearbox_Casing_Casting --> Gear_Cutting[Gear Cutting]
 Gear_Cutting --> Gearbox_Assembly[Gearbox Assembly]
 Motor_Assembly --> Subassembly_Integration[Subassembly Integration]
 Gearbox_Assembly --> Subassembly_Integration
 Wafer_Fabrication --> Inverter_Assembly[Inverter Assembly]
 Inverter_Assembly --> Subassembly_Integration
 Subassembly_Integration --> E_Axle_Final_Test[E-Axle Final Test ⚠️ $800M]
 E_Axle_Final_Test --> OEM_Logistics[OEM Logistics]
 Regulatory_Certification[Regulatory Certification] -.-> E_Axle_Final_Test
 OEM_Logistics --> Vehicle_Assembly[Vehicle Assembly]
 Vehicle_Assembly --> Dealer_Distribution[Dealer Distribution]
 Dealer_Distribution --> Fleet_and_Retail_Buyers[Fleet and Retail Buyers]
 Aftermarket_Service[Aftermarket Service] -.-> Fleet_and_Retail_Buyers

 Magnet_Manufacturing:::bottleneck
 Wafer_Fabrication:::bottleneck
 E_Axle_Final_Test:::bottleneck


Total Impact (USD): $11300M
Analysis Date: 2025-07-12 20:54:16
Model Version: o3-2024-12-17`
  },
  {
    id: "electric-class-4-5-delivery-trucks",
    context: `Industry: Electric Class 4-5 Delivery Trucks

Definition: Production of battery-electric Class 4 and 5 chassis and body configurations optimized for parcel, grocery and retail last-mile delivery routes

Market Size: $6.5 billion
Market Size (Billions): $6.5B
1-Year Growth: 52%
5-Year Growth: 36%

Key Drivers:
1. Rapid e-commerce growth and retailer pledges to electrify last-mile fleets
2. Lower total cost of ownership versus diesel in high stop-start duty cycles
3. Incentive programs such as the U.S. Commercial Clean Vehicle Credit and EU Fit-for-55 purchase subsidies
4. Urban zero-emission zones and night-delivery noise restrictions

Trends:
1. High-voltage silicon-carbide powertrains extending range for dense stop-start routes (Weight: 8.9, Type: tech)
2. Advanced telematics and over-the-air updates optimizing battery health and route efficiency (Weight: 8, Type: tech)
3. Retailer ESG disclosure pressure accelerating fleet conversions to zero-emission vehicles (Weight: 7.1, Type: behavioral)
4. Municipal congestion and curb-use charges favoring compact, quiet trucks (Weight: 6.5, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
These mid-sized electric trucks begin with mined metals such as lithium, nickel, cobalt, aluminum and steel. Refiners turn the battery metals into powders and foils, while metal stampers shape the body and frame parts. Cell factories build battery cells, pack plants group the cells, and vehicle plants bolt packs, motors and frames together. Body upfitters add parcel or grocery boxes, then dealers or fleet managers take delivery. Fleets must win permits and install depot chargers before the trucks start work. During daily routes telematics software tracks battery health, and trained technicians handle service and parts support.

Supply Chain Flow Chart:
flowchart LR
 Lithium_Nickel_Cobalt[Lithium, Nickel, Cobalt] --> Battery_Mineral_Refining[Battery Mineral Refining]
 Aluminum_Steel[Aluminum & Steel] --> Chassis_Parts[Chassis & Body Parts]
 Battery_Mineral_Refining --> Cell_Manufacturing[Battery Cell Manufacturing ⚠️ $1.2B]
 Cell_Manufacturing --> Pack_Assembly[Battery Pack Assembly]
 Chassis_Parts --> Frame_Assembly[Frame Assembly]
 Pack_Assembly --> Powertrain_Integration[Powertrain Integration]
 Frame_Assembly --> Powertrain_Integration
 Powertrain_Integration --> Final_Assembly[Vehicle Final Assembly]
 Final_Assembly --> Upfitters[Body Upfitters ⚠️ $0.9B]
 Upfitters --> Dealer_Distribution[Dealer & Fleet Distribution]
 Dealer_Distribution --> Charging_Installation[Depot Charging Installation ⚠️ $0.85B]
 Charging_Installation --> Fleet_Operations[Fleet Operations]
 Fleet_Operations --> Grid_Upgrades[Grid Upgrades ⚠️ $0.75B]
 Fleet_Operations --> Service_Network[Service & Maintenance ⚠️ $0.6B]
 Regulatory_Certifications[Regulatory Certifications] -.-> Final_Assembly
 Incentive_Approvals[Incentive Approvals] -.-> Dealer_Distribution


Total Impact (USD): $4300M
Analysis Date: 2025-07-12 20:52:33
Model Version: o3-2024-12-17`
  },
  {
    id: "clinical-decision-support-ai",
    context: `Industry: Clinical Decision Support & Diagnostic AI Platforms

Definition: Software platforms that ingest imaging, laboratory, and EHR data to deliver AI-driven diagnostic insights and point-of-care decision support for clinicians

Market Size: $12.5 billion
Market Size (Billions): $12.5B
1-Year Growth: 22%
5-Year Growth: 27%

Key Drivers:
1. Radiology and pathology workload growth
2. Reimbursement expansion for AI-assisted diagnostics
3. Enterprise EHR integration APIs lowering deployment friction
4. Cloud GPUs enabling large multimodal foundation models

Trends:
1. Multimodal foundation models combining imaging, text, and genomics (Weight: 9.4, Type: tech)
2. Regulatory fast-track pathways for software as a medical device (Weight: 7.8, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
These platforms act like smart copilot tools for doctors. Hospitals feed in X-ray and MRI images, lab results, and past medical notes. The software cleans and anonymizes the data, tags key patterns, and trains large artificial-intelligence models on cloud computers. Before release, the models must pass strict health-care safety tests and gain government clearance. Vendors then plug the approved tool into hospital record systems so it pops up inside the doctor's normal workflow. Doctors see real-time suggestions, confirm or reject them, and their feedback circles back to improve the model. Service teams keep the system updated and prove its value to payers and hospital finance chiefs.

Supply Chain Flow Chart:
flowchart LR
 Imaging_Data[Imaging Data] --> Data_Cleaning
 Lab_Data[Laboratory Data] --> Data_Cleaning
 EHR_Data[Electronic Health Record Data] --> Data_Cleaning
 Public_Datasets[Public Datasets] -.-> Data_Cleaning
 Data_Cleaning[Data Cleaning & De-identification] --> Data_Labeling[Data Labeling]
 Data_Labeling --> Model_Training_Cloud_GPUs[Model Training on Cloud GPUs ⚠️ $1.4B]
 Model_Training_Cloud_GPUs --> Validation
 Validation[Clinical Validation Trials] -.-> Regulatory_Clearance[FDA / EU Regulatory Clearance ⚠️ $0.8B]
 Regulatory_Clearance --> EHR_Integration[EHR Integration & Security Review ⚠️ $0.6B]
 EHR_Integration --> Deployment[Cloud Deployment & Updates]
 Deployment --> Clinicians[Clinician Use & Feedback]
 Clinicians --> Continuous_Learning[Continuous Learning Loop]
 Continuous_Learning --> Data_Cleaning
 Data_Privacy_Compliance[Data Privacy Compliance] -.-> Model_Training_Cloud_GPUs


Total Impact (USD): $7600M
Analysis Date: 2025-07-12 20:46:41
Model Version: o3-2024-12-17`
  },
  {
    id: "automotive-ai-processors",
    context: `Industry: Automotive AI Processors

Definition: Automotive-grade AI SoCs and ASICs powering advanced driver-assistance systems and autonomous driving stacks

Market Size: $5.2 billion
Market Size (Billions): $5.2B
1-Year Growth: 40%
5-Year Growth: 32%

Key Drivers:
1. Level 3–4 autonomous-driving feature rollouts in premium EV platforms
2. Safety-regulation mandates for driver monitoring and collision-avoidance systems
3. Migration to centralized vehicle compute architectures that consolidate multiple ECUs

Trends:
1. 5 nm/3 nm automotive SoCs integrating high-density NPUs and vision accelerators (Weight: 9, Type: tech)
2. Regulatory pressure for functional-safety compliance (Weight: 7, Type: behavioral)

--- SUPPLY CHAIN ANALYSIS ---

Industry Overview:
Cars now use special computer chips that run artificial-intelligence code for lane-keeping, collision warnings, and self-driving. Chip designers plan the circuit, license ready-made blocks, and simulate them with design software. A silicon foundry etches the tiny transistors onto pure silicon wafers, then the chips are cut, packaged, and stress-tested so they survive heat, vibration, and 15-year lifetimes. Safety labs certify the chips, and Tier-1 suppliers mount them on boards with memory and power parts. Automakers install the boards in new models, load driving software, and ship the cars. After sale, owners get over-the-air updates and service centers replace failed modules under warranty.

Supply Chain Flow Chart:
flowchart LR
 Raw_Silicon_Wafers[Raw Silicon Wafers] --> advanced_Foundry_Fabrication[Advanced Foundry Fabrication ⚠️ $1.8B]
 Rare_Earth_Metals[Rare Earth Metals] --> advanced_Foundry_Fabrication
 IP_Core_Licensing[IP Core Licensing] --> Chip_Design[Chip Design]
 EDA_Software[EDA Software Tools] --> Chip_Design
 Chip_Design --> advanced_Foundry_Fabrication
 advanced_Foundry_Fabrication --> Packaging_Testing[Packaging & Testing]
 Packaging_Testing --> Automotive_Qualification[Automotive Qualification ⚠️ $0.6B]
 Regulatory_Homologation[Regulatory Homologation] -.-> Automotive_Qualification
 Automotive_Qualification --> Tier1_Integration[Tier-1 Integration]
 Tier1_Integration --> Vehicle_OEM_Assembly[Vehicle OEM Assembly]
 Vehicle_OEM_Assembly --> OTA_Software_Support[OTA Software Support]
 OTA_Software_Support --> Drivers_End_Use[Drivers & Fleet Operators]
 advanced_Foundry_Fabrication:::bottleneck
 Automotive_Qualification:::bottleneck


Total Impact (USD): $4500M
Analysis Date: 2025-07-12 20:52:58
Model Version: o3-2024-12-17`
  }
];

// Output as JSON
console.log(JSON.stringify(clientProblems, null, 2));