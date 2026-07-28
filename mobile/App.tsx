import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import * as ScreenOrientation from "expo-screen-orientation";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type Role = "driver" | "bakery" | "pantry";
type Screen = "welcome" | "driver-access" | "driver-register" | "partner-login" | "partner-request" | "pending" | "workspace";
type Session = { role: Role; accountId: number; displayName: string; email: string; verificationStatus?: "not_started" | "pending" | "verified" | "needs_attention"; demo?: boolean };
type MobileRoute = { id: number; bakeryName: string; pantryName: string; driverName: string; scheduledArrival: string; status: "reserved" | "ongoing" | "completed"; createdAt: string };
type DriverProfile = { id: number; email: string; displayName: string; phone: string; homeAddress: string; homeZip: string; dateOfBirth: string; verificationStatus: "not_started" | "pending" | "verified" | "needs_attention" };
type DriverRideRequest = { id: number; serviceDate: string; earliestStart: string; latestFinish: string; startZip: string; endZip: string; maximumExtraMinutes: number | null; status: "active" | "paused" | "matched" | "expired" | "cancelled" };
type DriverRouteOffer = { id: number; status: "queued" | "offered" | "accepted" | "declined" | "expired" | "withdrawn"; expiresAt: string | null; estimatedBakeryArrival: string; estimatedPantryArrival: string; bakery: { name: string; address: string } | null; pantry: { name: string; address: string } | null };
type DriverNotification = { id: number; title: string; body: string; actionRequired: boolean; acknowledgedAt: string | null; createdAt: string };
type MobileContact = { id: number; name: string; email: string; phone: string; isPrimary: boolean };
type MobileWindow = { id: number; startsAt: string; endsAt: string; latestArrival: string; paused: boolean };
type WorkspaceData = {
  account: { accountEmail: string; administratorName: string; contactEmail: string; contactPhone: string };
  organization: {
    id: number; name: string; address: string; businessPhone: string; notificationPhone: string; dropoffInstructions: string;
    recurringDays: string; businessOpenTime?: string; businessCloseTime?: string; readyTime?: string; arrivalDeadline?: string; openTime?: string; closeTime?: string; latestArrival?: string;
  };
  contacts: MobileContact[];
  availabilityWindows: MobileWindow[];
  availabilityPauses: Array<{ id: number; endsAt: string }>;
  scheduleExceptions: Array<{ id: number; exceptionDate: string }>;
  routes: MobileRoute[];
  photos: Array<{ id: number; imageUrl: string; caption: string }>;
  pickupOccurrences: PickupOccurrence[];
  notifications: DriverNotification[];
};
type PickupOccurrence = { id: number; serviceDate: string; pickupWindowStartsAt: string; pickupDeadline: string; status: "scheduled" | "awaiting_confirmation" | "confirmed" | "decision_deferred" | "insufficient_food" | "reserved" | "cancelled"; confirmedAt: string | null };
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://www.baked-boston.com";
const TOKEN_KEY = "bakedboston.mobileToken";
const demoDriverSession: Session = { role: "driver", accountId: 0, displayName: "Jordan Taylor", email: "jordan.driver@example.com", verificationStatus: "verified", demo: true };

async function postAuth(payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_URL}/api/mobile/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { response, data: await response.json() };
  } finally {
    clearTimeout(timeout);
  }
}

const colors = {
  forest: "#173B2D",
  forestSoft: "#2F5A47",
  cream: "#F8F4E8",
  paper: "#FFFDF7",
  coral: "#EF6548",
  yellow: "#F4BF43",
  mint: "#DDEADF",
  sage: "#789084",
  border: "#D9E0D9",
  white: "#FFFFFF",
};

const roleCopy: Record<Role, { icon: string; title: string; description: string }> = {
  driver: { icon: "↗", title: "I’m a driver", description: "Discover, reserve, and complete food rescue routes." },
  bakery: { icon: "🥖", title: "I represent a bakery", description: "Publish surplus pickups and coordinate handoffs." },
  pantry: { icon: "🥫", title: "I represent a pantry", description: "Manage receiving windows and incoming deliveries." },
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [role, setRole] = useState<Role | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY).then(async (token) => {
      if (!token) return;
      const response = await fetch(`${API_URL}/api/mobile/auth`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) await SecureStore.deleteItemAsync(TOKEN_KEY);
      else {
        const data = await response.json();
        const restoredSession = data.session.role === "driver" ? demoDriverSession : data.session;
        setSession(restoredSession);
        setRole(restoredSession.role); setScreen("workspace");
      }
    }).catch(() => undefined);
  }, []);
  async function authenticated(data: { token: string; session: Session }) {
    await SecureStore.setItemAsync(TOKEN_KEY, data.token);
    setSession(data.session); setRole(data.session.role); setScreen("workspace");
  }
  async function signOut() {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) await fetch(`${API_URL}/api/mobile/auth`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    await SecureStore.deleteItemAsync(TOKEN_KEY); setSession(null); setRole(null); setScreen("welcome");
  }

  const chooseRole = (nextRole: Role) => {
    setRole(nextRole);
    if (nextRole === "driver") {
      setSession(demoDriverSession);
      setScreen("workspace");
    } else {
      setScreen("partner-login");
    }
  };

  const back = () => {
    if (screen === "driver-register") setScreen("driver-access");
    else if (screen === "partner-request") setScreen("partner-login");
    else {
      setRole(null);
      setScreen("welcome");
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar style={screen === "welcome" ? "light" : "dark"} />
      {screen === "welcome" ? (
        <WelcomeScreen onChoose={chooseRole} />
      ) : screen === "workspace" && session ? (
        <PortalHome session={session} onSignOut={signOut} />
      ) : (
        <AuthFrame onBack={back} role={role}>
          {screen === "driver-access" && (
            <DriverAccess onCreate={() => setScreen("driver-register")} onAuthenticated={authenticated} />
          )}
          {screen === "driver-register" && (
            <DriverRegistration onAuthenticated={authenticated} />
          )}
          {screen === "partner-login" && role && (
            <PartnerLogin role={role} onRequest={() => setScreen("partner-request")} onAuthenticated={authenticated} />
          )}
          {screen === "partner-request" && role && (
            <PartnerRequest role={role} onComplete={() => setScreen("pending")} />
          )}
          {screen === "pending" && (
            <PendingScreen role={role} onDone={() => {
              setRole(null);
              setScreen("welcome");
            }} />
          )}
        </AuthFrame>
      )}
    </SafeAreaProvider>
  );
}

function WelcomeScreen({ onChoose }: { onChoose: (role: Role) => void }) {
  return (
    <SafeAreaView style={styles.welcomeSafe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.welcomeScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandLetter}>B</Text></View>
          <Text style={styles.brandNameLight}>BakedBoston</Text>
          <View style={styles.nativePill}><Text style={styles.nativePillText}>FOOD RESCUE</Text></View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrowLight}>ONE NETWORK · THREE ROLES</Text>
          <Text style={styles.heroTitle}>Good food should{"\n"}go somewhere good.</Text>
          <Text style={styles.heroBody}>Join Boston’s community-powered network connecting bakery surplus with neighborhood food pantries.</Text>
        </View>

        <View style={styles.roleSheet}>
          <Text style={styles.sheetEyebrow}>GET STARTED</Text>
          <Text style={styles.sheetTitle}>How are you helping today?</Text>
          {(Object.keys(roleCopy) as Role[]).map((role) => {
            const copy = roleCopy[role];
            return (
              <Pressable key={role} accessibilityRole="button" onPress={() => onChoose(role)}
                style={({ pressed }) => [styles.roleCard, pressed && styles.roleCardPressed]}>
                <View style={[styles.roleIcon, role === "driver" && styles.driverIcon, role === "pantry" && styles.pantryIcon]}>
                  <Text style={styles.roleIconText}>{copy.icon}</Text>
                </View>
                <View style={styles.roleText}>
                  <Text style={styles.roleTitle}>{copy.title}</Text>
                  <Text style={styles.roleDescription}>{copy.description}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          })}
          <Text style={styles.securityNote}>Partner accounts are connected to organizations approved by BakedBoston.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AuthFrame({ children, onBack, role }: { children: React.ReactNode; onBack: () => void; role: Role | null }) {
  return (
    <SafeAreaView style={styles.authSafe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.authHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.backButton}>
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>
          <View style={styles.authBrand}><View style={styles.smallMark}><Text style={styles.smallMarkText}>B</Text></View><Text style={styles.authBrandText}>BakedBoston</Text></View>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {role && <View style={styles.roleBadge}><Text>{roleCopy[role].icon}</Text><Text style={styles.roleBadgeText}>{role}</Text></View>}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function DriverAccess({ onCreate, onAuthenticated }: { onCreate: () => void; onAuthenticated: (data: { token: string; session: Session }) => Promise<void> }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function login() { setBusy(true); setError(""); try { const { response, data } = await postAuth({ action: "login", role: "driver", email, password }); if (response.ok) await onAuthenticated(data); else setError(data.error ?? "Could not sign in."); } catch { setError("The login request timed out. Check your connection and try again."); } finally { setBusy(false); } }
  return <>
    <Text style={styles.authEyebrow}>DRIVER ACCESS</Text>
    <Text style={styles.authTitle}>Ready to rescue?</Text>
    <Text style={styles.authBody}>Create a volunteer profile to discover routes near you, or sign in to continue an existing rescue.</Text>
    <PrimaryButton label="Create driver account" onPress={onCreate} />
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>OR SIGN IN</Text>
      <View style={styles.dividerLine} />
    </View>
    <Field label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
    <Field
      label="Password"
      value={password}
      onChangeText={setPassword}
      placeholder="Enter your password"
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      textContentType="password"
    />
    {error ? <Text style={styles.errorText}>{error}</Text> : null}
    <PrimaryButton label={busy ? "Signing in…" : "Sign in as driver"} dark disabled={busy || !email || !password} onPress={login} />
    <Pressable><Text style={styles.linkText}>Forgot your password?</Text></Pressable>
  </>;
}

function DriverRegistration({ onAuthenticated }: { onAuthenticated: (data: { token: string; session: Session }) => Promise<void> }) {
  const [agreed, setAgreed] = useState(false);
  const [form, setForm] = useState({ displayName: "", email: "", phone: "", homeAddress: "", homeZip: "", dateOfBirth: "", password: "" }); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function register() { setBusy(true); setError(""); try { const { response, data } = await postAuth({ action: "register-driver", role: "driver", ...form }); if (response.ok) await onAuthenticated(data); else setError(data.error ?? "Could not create driver account."); } catch { setError("The registration request timed out. Check your connection and try again."); } finally { setBusy(false); } }
  return <>
    <Text style={styles.authEyebrow}>NEW DRIVER</Text>
    <Text style={styles.authTitle}>Create your profile.</Text>
    <Text style={styles.authBody}>You’ll use this account to reserve routes, confirm pickups, and record completed deliveries.</Text>
    <Field label="Legal name" value={form.displayName} onChangeText={(displayName) => setForm({ ...form, displayName })} placeholder="Name shown on your ID" textContentType="name" />
    <Field label="Email address" value={form.email} onChangeText={(email) => setForm({ ...form, email })} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
    <Field label="Mobile number" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} placeholder="(617) 555-0123" keyboardType="phone-pad" />
    <Field label="Home address" value={form.homeAddress} onChangeText={(homeAddress) => setForm({ ...form, homeAddress })} placeholder="Street, city, state" textContentType="fullStreetAddress" />
    <Field label="Home ZIP code" value={form.homeZip} onChangeText={(homeZip) => setForm({ ...form, homeZip })} placeholder="02118" keyboardType="number-pad" />
    <Field label="Date of birth" value={form.dateOfBirth} onChangeText={(dateOfBirth) => setForm({ ...form, dateOfBirth })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
    <Field
      label="Create password"
      value={form.password}
      onChangeText={(password) => setForm({ ...form, password })}
      placeholder="At least 10 characters"
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      textContentType="newPassword"
    />
    <Pressable style={styles.consentRow} onPress={() => setAgreed((current) => !current)}>
      <View style={[styles.checkbox, agreed && styles.checkboxSelected]}>{agreed && <Text style={styles.checkmark}>✓</Text>}</View>
      <Text style={styles.consentText}>I agree to follow food-safety instructions and accurately confirm pickups and deliveries.</Text>
    </Pressable>
    <View style={styles.verificationPreview}><Text style={styles.verificationPreviewTitle}>Identity verification required</Text><Text style={styles.verificationPreviewBody}>After creating your account, you’ll verify a government-issued ID before reserving a delivery. BakedBoston will store the verification result, not your ID images.</Text></View>
    {error ? <Text style={styles.errorText}>{error}</Text> : null}
    <PrimaryButton label={busy ? "Creating profile…" : "Create driver profile"} disabled={!agreed || busy} onPress={register} />
  </>;
}

function PartnerLogin({ role, onRequest, onAuthenticated }: { role: Role; onRequest: () => void; onAuthenticated: (data: { token: string; session: Session }) => Promise<void> }) {
  const organization = role === "bakery" ? "bakery" : "pantry";
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function login() { setBusy(true); setError(""); try { const { response, data } = await postAuth({ action: "login", role, email, password }); if (response.ok) await onAuthenticated(data); else setError(data.error ?? "Could not sign in."); } catch { setError("The login request timed out. Check your connection and try again."); } finally { setBusy(false); } }
  return <>
    <Text style={styles.authEyebrow}>APPROVED PARTNER</Text>
    <Text style={styles.authTitle}>Welcome back.</Text>
    <Text style={styles.authBody}>Sign in with the account linked to your approved {organization} organization.</Text>
    <Field label="Work email" value={email} onChangeText={setEmail} placeholder={`name@your${organization}.org`} keyboardType="email-address" autoCapitalize="none" />
    <Field
      label="Password"
      value={password}
      onChangeText={setPassword}
      placeholder="Enter your password"
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      textContentType="password"
    />
    {error ? <Text style={styles.errorText}>{error}</Text> : null}
    <PrimaryButton label={busy ? "Signing in…" : `Sign in to ${organization} workspace`} dark disabled={busy || !email || !password} onPress={login} />
    <View style={styles.partnerHelp}>
      <Text style={styles.partnerHelpTitle}>Not registered with BakedBoston?</Text>
      <Text style={styles.partnerHelpBody}>Submit an access request. An administrator will verify your organization before an account is activated.</Text>
      <Pressable onPress={onRequest}><Text style={styles.partnerHelpLink}>Request partner access →</Text></Pressable>
    </View>
  </>;
}

function PartnerRequest({ role, onComplete }: { role: Role; onComplete: () => void }) {
  const organization = role === "bakery" ? "bakery" : "pantry";
  return <>
    <Text style={styles.authEyebrow}>PARTNER APPLICATION</Text>
    <Text style={styles.authTitle}>Request access.</Text>
    <Text style={styles.authBody}>Tell us who you are. This request does not create an active account until BakedBoston approves the organization.</Text>
    <Field label="Organization name" placeholder={`Your ${organization} name`} />
    <Field label="Organization address" placeholder="Street, city, state, ZIP" />
    <Field label="Your full name" placeholder="Primary contact" />
    <Field label="Work email" placeholder="name@organization.org" keyboardType="email-address" autoCapitalize="none" />
    <Field label="Mobile number" placeholder="(617) 555-0123" keyboardType="phone-pad" />
    <Field label="Notes" placeholder="Anything we should know?" multiline />
    <PrimaryButton label="Submit access request" onPress={onComplete} />
  </>;
}

function PortalHome({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  if (session.role === "bakery" || session.role === "pantry") {
    return <PartnerPortal session={session} onSignOut={onSignOut} />;
  }
  return <DriverPortal session={session} onSignOut={onSignOut} />;
}

type DriverSection = "home" | "search" | "routes" | "profile";
const previewDriverRoutes = [
  { id: 1, timing: "Available now", bakery: "Sample bakery", pantry: "Sample pantry", pickup: "5:10 PM", finish: "6:05 PM", drive: "25 min driving", ending: "Ends near 02130", reason: "Best balance of travel time and pantry priority" },
  { id: 2, timing: "Later today", bakery: "Example pickup", pantry: "Example destination", pickup: "6:00 PM", finish: "6:50 PM", drive: "20 min driving", ending: "Ends near 02446", reason: "Short route toward the preferred destination" },
];

function DriverPortal({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const demoProfile: DriverProfile = { id: 0, email: "jordan.driver@example.com", displayName: "Jordan Taylor", phone: "(617) 555-0148", homeAddress: "125 Example Street, Boston, MA", homeZip: "02130", dateOfBirth: "2000-04-18", verificationStatus: "verified" };
  const [section, setSection] = useState<DriverSection>("home");
  const [profile, setProfile] = useState<DriverProfile | null>(session.demo ? demoProfile : null);
  const [error, setError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [search, setSearch] = useState({ date: localDateString(new Date()), earliest: "17:00", latest: "19:00", startZip: "", endZip: "" });
  const [searched, setSearched] = useState(false);
  const [rideRequests, setRideRequests] = useState<DriverRideRequest[]>([]);
  const [routeOffers, setRouteOffers] = useState<DriverRouteOffer[]>([]);
  const [driverNotifications, setDriverNotifications] = useState<DriverNotification[]>([]);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    let timer: ReturnType<typeof setInterval> | undefined;
    if (!session.demo) {
      loadDriverProfile().then(setProfile).catch(() => setError("Could not load the driver profile."));
      const refreshMatching = () => loadDriverMatching().then((data) => {
        setRideRequests(data.requests);
        setRouteOffers(data.offers);
        setDriverNotifications(data.notifications);
      }).catch(() => setError("Could not load saved ride requests."));
      void refreshMatching();
      timer = setInterval(refreshMatching, 20_000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [session.demo]);
  async function saveRideRequest() {
    setError("");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(search.date) || search.earliest >= search.latest) {
      setError("Choose a valid date and a latest finish after the earliest start.");
      return;
    }
    if ((search.startZip && !/^\d{5}$/.test(search.startZip)) || (search.endZip && !/^\d{5}$/.test(search.endZip))) {
      setError("ZIP-code preferences must contain five digits.");
      return;
    }
    const draft: DriverRideRequest = {
      id: -Date.now(), serviceDate: search.date,
      earliestStart: mobileLocalDateTime(search.date, search.earliest),
      latestFinish: mobileLocalDateTime(search.date, search.latest),
      startZip: search.startZip, endZip: search.endZip, maximumExtraMinutes: null, status: "active",
    };
    if (session.demo) {
      setRideRequests((current) => [draft, ...current]);
      setSearched(true);
      return;
    }
    try {
      const data = await createDriverRideRequest(draft);
      setRideRequests((current) => [data.request, ...current]);
      setSearched(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this ride request.");
    }
  }
  async function respondToOffer(offer: DriverRouteOffer, action: "accept-offer" | "decline-offer") {
    try {
      await updateDriverMatching({ action, offerId: offer.id });
      const data = await loadDriverMatching();
      setRideRequests(data.requests); setRouteOffers(data.offers); setDriverNotifications(data.notifications);
      Alert.alert(action === "accept-offer" ? "Route reserved" : "Offer declined", action === "accept-offer" ? "The bakery and pantry have been notified." : "Your saved request remains available for future matches.");
    } catch (reason) {
      Alert.alert("Could not update offer", reason instanceof Error ? reason.message : "Please try again.");
    }
  }
  const verificationStatus = profile?.verificationStatus ?? session.verificationStatus ?? "not_started";
  const verificationLabel = verificationStatus === "verified" ? "Identity verified" : verificationStatus === "pending" ? "Verification pending" : verificationStatus === "needs_attention" ? "Verification needs attention" : "Verification required";
  const tabs: Array<{ id: DriverSection; label: string; icon: string }> = [
    { id: "home", label: "Home", icon: "⌂" },
    { id: "search", label: "Search", icon: "⌕" },
    { id: "routes", label: "My routes", icon: "↗" },
    { id: "profile", label: "Profile", icon: "○" },
  ];
  const driverName = profile?.displayName ?? session.displayName;
  const driverEmail = profile?.email ?? session.email;
  function signOutFromMenu() {
    Alert.alert("Log out of BakedBoston?", "You’ll need to sign in again to access this driver profile.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: onSignOut },
    ]);
  }
  return <SafeAreaView style={styles.workspaceSafe} edges={["top", "bottom"]}>
    <View style={styles.workspaceHeader}>
      <View style={styles.smallMark}><Text style={styles.smallMarkText}>B</Text></View><Text style={styles.workspaceBrand}>BakedBoston</Text>
      <View style={styles.driverAccountControl}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open driver account menu" onPress={() => setAccountMenuOpen((open) => !open)} style={styles.driverAvatarButton}>
          <Text style={styles.driverAvatarText}>{initials(driverName)}</Text><Text style={styles.driverAvatarChevron}>{accountMenuOpen ? "⌃" : "⌄"}</Text>
        </Pressable>
        {accountMenuOpen && <View style={styles.driverAccountMenu}>
          <Text style={styles.driverAccountName}>{driverName}</Text>
          <Text style={styles.driverAccountEmail} numberOfLines={1}>{driverEmail}</Text>
          <View style={styles.driverApprovalRow}><View style={[styles.verificationStatusDot, verificationStatus === "verified" && styles.verificationStatusDotVerified]} /><Text style={styles.driverHeaderStatusText}>{verificationLabel}</Text></View>
          <Pressable style={styles.driverAccountMenuItem} onPress={() => { setSection("profile"); setAccountMenuOpen(false); }}><Text style={styles.driverAccountMenuText}>View profile</Text></Pressable>
          <Pressable style={styles.driverAccountMenuItem} onPress={signOutFromMenu}><Text style={styles.driverLogoutText}>Log out</Text></Pressable>
        </View>}
      </View>
    </View>
    <View style={styles.driverTabs}>{tabs.map((tab) => <Pressable key={tab.id} onPress={() => setSection(tab.id)} style={[styles.driverTab, section === tab.id && styles.driverTabActive]}><Text style={[styles.driverTabIcon, section === tab.id && styles.driverTabTextActive]}>{tab.icon}</Text><Text style={[styles.driverTabText, section === tab.id && styles.driverTabTextActive]}>{tab.label}</Text></Pressable>)}</View>
    <ScrollView contentContainerStyle={styles.driverContent} keyboardShouldPersistTaps="handled">
      {session.demo && <View style={styles.driverDemoBanner}><Text style={styles.driverDemoBannerText}>PROTOTYPE DRIVER · FICTIONAL PROFILE</Text></View>}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {section === "home" && <><DriverHome displayName={profile?.displayName ?? session.displayName} verified={verificationStatus === "verified"} onSearch={() => setSection("search")} />{driverNotifications.slice(0, 3).map((notification) => <DriverNotificationCard notification={notification} key={notification.id} />)}{routeOffers.filter((offer) => offer.status === "offered").map((offer) => <LiveRouteOffer offer={offer} onRespond={respondToOffer} key={offer.id} />)}</>}
      {section === "search" && <View><Text style={styles.authEyebrow}>PLAN A DELIVERY</Text><Text style={styles.driverPageTitle}>Search for a route</Text><Text style={styles.authBody}>Choose when you can drive. Starting and destination ZIP codes are optional preferences, not strict limits. If no confirmed pickup exists yet, BakedBoston will notify you when one matches.</Text><View style={styles.driverSearchCard}><Field label="Date" value={search.date} onChangeText={(date) => setSearch({ ...search, date })} placeholder="YYYY-MM-DD" /><View style={styles.driverSearchTimeRow}><TimeEditorField label="Earliest start" value={search.earliest} onChange={(earliest) => setSearch({ ...search, earliest })} /><TimeEditorField label="Latest finish" value={search.latest} onChange={(latest) => setSearch({ ...search, latest })} /></View><Field label="Preferred starting ZIP (optional)" value={search.startZip} onChangeText={(startZip) => setSearch({ ...search, startZip })} placeholder="Use current location" keyboardType="number-pad" /><Field label="Preferred destination ZIP (optional)" value={search.endZip} onChangeText={(endZip) => setSearch({ ...search, endZip })} placeholder="Anywhere is okay" keyboardType="number-pad" /><Pressable style={styles.locationPreferenceButton} onPress={() => Alert.alert("Current location", "Location permission will be connected when live route optimization is enabled. You can use a ZIP code during prototype testing.")}><Text style={styles.locationPreferenceText}>⌖ Use my current location</Text></Pressable><PrimaryButton label="Save ride request & find matches" dark onPress={saveRideRequest} /></View>{searched && <Text style={styles.calendarNotice}>{session.demo ? "Prototype ride request saved for this session." : "Ride request saved. We’ll notify you when a confirmed pickup matches."}</Text>}<DriverRideRequestList requests={rideRequests} /></View>}
      {section === "routes" && <View><Text style={styles.authEyebrow}>DELIVERY ACTIVITY</Text><Text style={styles.driverPageTitle}>My routes</Text>{routeOffers.filter((offer) => ["offered", "accepted"].includes(offer.status)).map((offer) => <LiveRouteOffer offer={offer} onRespond={respondToOffer} key={offer.id} />)}{!routeOffers.some((offer) => ["offered", "accepted"].includes(offer.status)) && <View style={styles.driverEmptyCard}><Text style={styles.connectedTitle}>No routes yet</Text><Text style={styles.connectedBody}>Reserved, active, and completed deliveries will appear here.</Text><Pressable style={styles.portalFeatureButton} onPress={() => setSection("search")}><Text style={styles.portalFeatureButtonText}>Search for a route</Text></Pressable></View>}</View>}
      {section === "profile" && profile && <DriverProfilePage profile={profile} notice={profileNotice} onChange={setProfile} onSave={async () => { setProfileNotice(""); if (session.demo) { setProfileNotice("Demo profile updated for this session."); return; } try { const updated = await saveDriverProfile(profile); setProfile(updated); setProfileNotice("Profile saved."); } catch (reason) { setProfileNotice(reason instanceof Error ? reason.message : "Could not save profile."); } }} onSignOut={onSignOut} />}
    </ScrollView>
  </SafeAreaView>;
}

function DriverHome({ displayName, verified, onSearch }: { displayName: string; verified: boolean; onSearch: () => void }) {
  return <View><Text style={styles.authEyebrow}>DRIVER HOME</Text><Text style={styles.driverPageTitle}>Hello, {displayName || "driver"}.</Text>{!verified && <View style={styles.driverVerificationCard}><View style={styles.driverVerificationHeading}><View><Text style={styles.authEyebrow}>BEFORE YOUR FIRST ROUTE</Text><Text style={styles.connectedTitle}>Verify your identity</Text></View><View style={styles.verificationStatusDot} /></View><Text style={styles.connectedBody}>You can preview and search for routes now. Reservations will become available after secure identity verification.</Text><PrimaryButton label="Verify identity" dark onPress={() => Alert.alert("Identity verification", "The secure Stripe Identity connection will be enabled after BakedBoston’s Stripe account and development build are configured.")} /></View>}<View style={styles.driverFeedHeading}><View><Text style={styles.connectedTitle}>Recommended routes</Text><Text style={styles.connectedBody}>The best available deliveries for your current time and area.</Text></View><Pressable style={styles.driverSearchShortcut} onPress={onSearch}><Text style={styles.driverSearchShortcutText}>Search</Text></Pressable></View><Text style={styles.previewLabel}>PROTOTYPE PREVIEW — NOT LIVE DELIVERIES</Text>{previewDriverRoutes.map((route) => <DriverRoutePreview route={route} verified={verified} key={route.id} />)}</View>;
}

function DriverRoutePreview({ route, verified }: { route: typeof previewDriverRoutes[number]; verified: boolean }) {
  return <View style={styles.driverRouteCard}><View style={styles.driverRouteTop}><Text style={styles.driverRouteTiming}>{route.timing}</Text><Text style={styles.driverRouteDrive}>{route.drive}</Text></View><Text style={styles.driverRouteName}>{route.bakery}</Text><View style={styles.driverRouteLine} /><Text style={styles.driverRouteName}>{route.pantry}</Text><View style={styles.driverRouteFacts}><Text style={styles.driverRouteFact}>Pickup {route.pickup}</Text><Text style={styles.driverRouteFact}>Finish {route.finish}</Text><Text style={styles.driverRouteFact}>{route.ending}</Text></View><Text style={styles.driverRouteReason}>{route.reason}</Text><Pressable disabled={!verified} style={[styles.driverReserveButton, !verified && styles.disabledButton]} onPress={() => Alert.alert("Preview only", "Live reservations will be connected to the optimization service.")}><Text style={styles.driverReserveButtonText}>{verified ? "View route" : "Verification required"}</Text></Pressable></View>;
}

function DriverRideRequestList({ requests }: { requests: DriverRideRequest[] }) {
  if (!requests.length) return null;
  return <View style={styles.savedRequestList}><Text style={styles.previewLabel}>SAVED RIDE REQUESTS</Text>{requests.map((request) => <View style={styles.savedRequestCard} key={request.id}>
    <View style={styles.driverRouteTop}><Text style={styles.driverRouteTiming}>{new Date(`${request.serviceDate}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</Text><Text style={styles.driverRouteDrive}>{request.status}</Text></View>
    <Text style={styles.connectedTitle}>{formatMobileTime(request.earliestStart)}–{formatMobileTime(request.latestFinish)}</Text>
    <Text style={styles.connectedBody}>{request.startZip ? `Start near ${request.startZip}` : "Any starting area"} · {request.endZip ? `End near ${request.endZip}` : "Any destination"}</Text>
    <Text style={styles.driverRouteReason}>We’ll evaluate this request whenever a bakery confirms a compatible pickup.</Text>
  </View>)}</View>;
}

function LiveRouteOffer({ offer, onRespond }: { offer: DriverRouteOffer; onRespond: (offer: DriverRouteOffer, action: "accept-offer" | "decline-offer") => void }) {
  return <View style={[styles.driverRouteCard, styles.liveOfferCard]}>
    <View style={styles.driverRouteTop}><Text style={styles.driverRouteTiming}>{offer.status === "offered" ? "Held for you · 5 minutes" : "Reserved"}</Text><Text style={styles.driverRouteDrive}>{offer.status}</Text></View>
    <Text style={styles.driverRouteName}>{offer.bakery?.name ?? "Bakery pickup"}</Text><View style={styles.driverRouteLine} /><Text style={styles.driverRouteName}>{offer.pantry?.name ?? "Pantry delivery"}</Text>
    <View style={styles.driverRouteFacts}><Text style={styles.driverRouteFact}>Pickup {formatMobileTime(offer.estimatedBakeryArrival)}</Text><Text style={styles.driverRouteFact}>Arrival {formatMobileTime(offer.estimatedPantryArrival)}</Text></View>
    {offer.status === "offered" && <View style={styles.offerActions}><Pressable onPress={() => onRespond(offer, "decline-offer")}><Text style={styles.offerDeclineText}>Not this one</Text></Pressable><Pressable style={styles.driverReserveButton} onPress={() => onRespond(offer, "accept-offer")}><Text style={styles.driverReserveButtonText}>Reserve this route</Text></Pressable></View>}
    {offer.status === "accepted" && <View style={styles.routeDirectionActions}>
      <Pressable style={styles.primaryDirectionButton} onPress={() => offer.bakery?.address && chooseNavigationApp(offer.bakery.name, offer.bakery.address)}><Text style={styles.portalStatusButtonText}>Directions to bakery</Text></Pressable>
      <Pressable style={styles.secondaryDirectionButton} onPress={() => offer.pantry?.address && chooseNavigationApp(offer.pantry.name, offer.pantry.address)}><Text style={styles.secondaryDirectionText}>Directions to pantry · after pickup</Text></Pressable>
    </View>}
  </View>;
}

function chooseNavigationApp(destinationName: string, address: string) {
  const encodedDestination = encodeURIComponent(address);
  const options = [
    ...(Platform.OS === "ios" ? [{
      text: "Apple Maps",
      onPress: () => openNavigationUrl(`https://maps.apple.com/?daddr=${encodedDestination}&dirflg=d`),
    }] : [{
      text: "Default maps",
      onPress: () => openNavigationUrl(`geo:0,0?q=${encodedDestination}`),
    }]),
    {
      text: "Google Maps",
      onPress: () => openNavigationUrl(`https://www.google.com/maps/dir/?api=1&destination=${encodedDestination}&travelmode=driving`),
    },
    {
      text: "Waze",
      onPress: () => openNavigationUrl(`https://waze.com/ul?q=${encodedDestination}&navigate=yes`),
    },
    { text: "Cancel", style: "cancel" as const },
  ];
  Alert.alert(`Directions to ${destinationName}`, address, options);
}

async function openNavigationUrl(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Could not open directions", "Install or enable a mapping app, then try again.");
  }
}

function DriverNotificationCard({ notification }: { notification: DriverNotification }) {
  return <View style={styles.driverNotificationCard}><Text style={styles.authEyebrow}>{notification.actionRequired ? "ACTION REQUIRED" : "DELIVERY UPDATE"}</Text><Text style={styles.connectedTitle}>{notification.title}</Text><Text style={styles.connectedBody}>{notification.body}</Text></View>;
}

function DriverProfilePage({ profile, notice, onChange, onSave, onSignOut }: { profile: DriverProfile; notice: string; onChange: (profile: DriverProfile) => void; onSave: () => void; onSignOut: () => void }) {
  return <View><Text style={styles.authEyebrow}>DRIVER ACCOUNT</Text><Text style={styles.driverPageTitle}>Profile</Text><View style={styles.driverProfileCard}><Field label="Legal name" value={profile.displayName} onChangeText={(displayName) => onChange({ ...profile, displayName })} /><Field label="Account email" value={profile.email} onChangeText={(email) => onChange({ ...profile, email })} keyboardType="email-address" autoCapitalize="none" /><Field label="Mobile number" value={profile.phone} onChangeText={(phone) => onChange({ ...profile, phone })} keyboardType="phone-pad" /><Field label="Home address" value={profile.homeAddress} onChangeText={(homeAddress) => onChange({ ...profile, homeAddress })} /><Field label="Home ZIP code" value={profile.homeZip} onChangeText={(homeZip) => onChange({ ...profile, homeZip })} keyboardType="number-pad" /><Field label="Date of birth" value={profile.dateOfBirth} editable={false} /><Text style={styles.privateProfileNote}>Your address and date of birth are private and are not shown to bakeries or pantries.</Text>{notice ? <Text style={styles.calendarNotice}>{notice}</Text> : null}<PrimaryButton label="Save profile" dark onPress={onSave} /></View><Pressable onPress={onSignOut}><Text style={styles.workspaceSignOut}>Sign out</Text></Pressable></View>;
}

async function driverRequest(method: "GET" | "PATCH", body?: Record<string, unknown>) {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const response = await fetch(`${API_URL}/api/mobile/driver`, { method, headers: { Authorization: `Bearer ${token ?? ""}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Driver request failed.");
  return data as { driver: DriverProfile };
}
async function loadDriverProfile() { return (await driverRequest("GET")).driver; }
async function saveDriverProfile(profile: DriverProfile) { return (await driverRequest("PATCH", { email: profile.email, displayName: profile.displayName, phone: profile.phone, homeAddress: profile.homeAddress, homeZip: profile.homeZip })).driver; }
async function driverMatchingRequest(method: "GET" | "POST" | "PATCH", body?: Record<string, unknown>) {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const response = await fetch(`${API_URL}/api/mobile/driver/requests`, {
    method,
    headers: { Authorization: `Bearer ${token ?? ""}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Driver matching request failed.");
  return data as { request: DriverRideRequest; requests: DriverRideRequest[]; offers: DriverRouteOffer[]; notifications: DriverNotification[] };
}
async function loadDriverMatching() { return driverMatchingRequest("GET"); }
async function createDriverRideRequest(request: DriverRideRequest) {
  return driverMatchingRequest("POST", {
    serviceDate: request.serviceDate, earliestStart: request.earliestStart, latestFinish: request.latestFinish,
    startZip: request.startZip, endZip: request.endZip, maximumExtraMinutes: request.maximumExtraMinutes,
  });
}
async function updateDriverMatching(body: Record<string, unknown>) { return driverMatchingRequest("PATCH", body); }

type PartnerSection = "overview" | "activity" | "schedule" | "profile";

function PartnerPortal({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const landscape = width > height;
  const bakery = session.role === "bakery";
  const [section, setSection] = useState<PartnerSection>("overview");
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [workspaceError, setWorkspaceError] = useState("");
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => undefined);
  }, []);
  const refreshWorkspace = useCallback(async () => {
    setWorkspaceError("");
    await SecureStore.getItemAsync(TOKEN_KEY).then(async (token) => {
      if (!token) throw new Error("Your session has expired.");
      const response = await fetch(`${API_URL}/api/mobile/workspace`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json() as WorkspaceData & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load the workspace.");
      if (bakery && !data.pickupOccurrences.some((occurrence) => occurrence.serviceDate === localDateString(new Date()))) {
        const pickupWindow = mobileBakeryWindowForToday(data);
        if (pickupWindow) {
          const created = await workspaceRequest("POST", {
            action: "create-pickup-occurrence",
            serviceDate: localDateString(new Date()),
            pickupWindowStartsAt: mobileLocalDateTime(localDateString(new Date()), pickupWindow.readyTime),
            pickupDeadline: mobileLocalDateTime(localDateString(new Date()), pickupWindow.pickupDeadline),
          });
          if (created.response.ok) data.pickupOccurrences = [created.data.record, ...data.pickupOccurrences];
        }
      }
      setWorkspace(data);
    }).catch((error) => setWorkspaceError(error instanceof Error ? error.message : "Could not load the workspace."));
  }, []);
  useEffect(() => { void refreshWorkspace(); }, [refreshWorkspace]);
  useEffect(() => {
    const refreshNotifications = () => mobileNotificationsRequest("GET").then((data) => {
      setWorkspace((current) => current ? {
        ...current,
        notifications: data.notifications,
        ...(bakery ? { pickupOccurrences: data.pickupOccurrences } : {}),
      } : current);
    }).catch(() => undefined);
    const timer = setInterval(refreshNotifications, 20_000);
    return () => clearInterval(timer);
  }, [bakery]);
  const nav: Array<{ key: PartnerSection; icon: string; label: string }> = [
    { key: "overview", icon: "⌂", label: "Overview" },
    { key: "activity", icon: "↗", label: "Delivery activity" },
    { key: "schedule", icon: "◷", label: bakery ? "Pickup schedule" : "Receiving schedule" },
    { key: "profile", icon: "⚙", label: "Profile & contacts" },
  ];
  const title = section === "overview" ? "Good afternoon." : nav.find((item) => item.key === section)?.label ?? "";

  return (
    <SafeAreaView style={styles.portalSafe} edges={landscape ? ["top"] : ["top", "bottom"]}>
      <View style={[styles.portalShell, landscape ? styles.portalLandscape : styles.portalPortrait]}>
        {landscape ? (
          <View style={[styles.portalSidebar, { width: 238 + insets.left, paddingLeft: 18 + insets.left }]}>
            <PortalBrand light />
            <View style={styles.portalOrganization}>
              <Text style={styles.portalOrganizationIcon}>{bakery ? "🥖" : "🥫"}</Text>
              <View style={styles.portalOrganizationCopy}>
                <Text style={styles.portalOrganizationType}>{bakery ? "BAKERY" : "PANTRY"} WORKSPACE</Text>
                <Text style={styles.portalOrganizationName} numberOfLines={2}>{workspace?.organization.name ?? session.displayName}</Text>
              </View>
            </View>
            <View style={styles.portalSideNav}>
              {nav.map((item) => <PortalNavButton key={item.key} item={item} selected={section === item.key} onPress={() => setSection(item.key)} compact={false} />)}
            </View>
            <View style={styles.portalSideBottom}>
              <Text style={styles.portalAccountEmail} numberOfLines={1}>{workspace?.account.accountEmail ?? session.email}</Text>
              <Pressable onPress={onSignOut}><Text style={styles.portalSignOut}>Sign out</Text></Pressable>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.portalMobileHeader}>
              <PortalBrand />
              <View style={styles.portalMobileRole}><Text>{bakery ? "🥖" : "🥫"}</Text><Text style={styles.portalMobileRoleText}>{bakery ? "Bakery" : "Pantry"}</Text></View>
              <Pressable onPress={onSignOut}><Text style={styles.portalSignOut}>Sign out</Text></Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.portalMobileNav} contentContainerStyle={styles.portalMobileNavContent}>
              {nav.map((item) => <PortalNavButton key={item.key} item={item} selected={section === item.key} onPress={() => setSection(item.key)} compact />)}
            </ScrollView>
          </>
        )}
        <View style={styles.portalMain}>
          <View style={[styles.portalPageHeader, landscape && { paddingRight: 30 + insets.right }, !landscape && styles.portalPageHeaderMobile]}>
            <View>
              <Text style={styles.portalKicker}>{bakery ? "BAKERY PARTNER" : "PANTRY PARTNER"}</Text>
              <Text style={[styles.portalPageTitle, !landscape && styles.portalPageTitleMobile]}>{title}</Text>
            </View>
            <View style={styles.portalAvatar}><Text style={styles.portalAvatarText}>{initials(workspace?.organization.name ?? session.displayName)}</Text></View>
          </View>
          <PartnerSectionContent section={section} bakery={bakery} landscape={landscape} rightInset={landscape ? insets.right : 0} workspace={workspace} error={workspaceError} onNavigate={setSection} onChanged={refreshWorkspace} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function PortalBrand({ light = false }: { light?: boolean }) {
  return <View style={styles.portalBrand}><View style={styles.smallMark}><Text style={styles.smallMarkText}>B</Text></View><Text style={[styles.portalBrandText, light && styles.portalBrandTextLight]}>BakedBoston</Text></View>;
}

function PortalNavButton({ item, selected, onPress, compact }: {
  item: { key: PartnerSection; icon: string; label: string }; selected: boolean; onPress: () => void; compact: boolean;
}) {
  return <Pressable onPress={onPress} style={[compact ? styles.portalMobileNavButton : styles.portalSideNavButton, selected && (compact ? styles.portalMobileNavSelected : styles.portalSideNavSelected)]}>
    <Text style={[styles.portalNavIcon, selected && styles.portalNavSelectedText]}>{item.icon}</Text>
    <Text style={[compact ? styles.portalMobileNavLabel : styles.portalSideNavLabel, selected && styles.portalNavSelectedText]} numberOfLines={1}>{item.label}</Text>
  </Pressable>;
}

function PartnerSectionContent({ section, bakery, landscape, rightInset, workspace, error, onNavigate, onChanged }: {
  section: PartnerSection; bakery: boolean; landscape: boolean; rightInset: number; workspace: WorkspaceData | null; error: string; onNavigate: (section: PartnerSection) => void; onChanged: () => Promise<void>;
}) {
  if (error) return <WorkspaceMessage title="Could not load workspace" body={error} />;
  if (!workspace) return <WorkspaceMessage title="Loading your workspace…" body="Syncing the latest BakedBoston information." />;
  const completed = workspace.routes.filter((route) => route.status === "completed");
  const now = new Date();
  const thisMonth = workspace.routes.filter((route) => {
    const date = new Date(route.createdAt);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const upcoming = workspace.routes.find((route) => route.status !== "completed");
  const activeOneTime = workspace.availabilityWindows.find((window) => !window.paused && new Date(window.startsAt) <= now && new Date(window.endsAt) > now);
  const paused = workspace.availabilityPauses.some((pause) => new Date(pause.endsAt) > now);
  if (section === "overview") {
    return <ScrollView contentContainerStyle={[styles.portalContent, landscape && { paddingRight: 28 + rightInset }, !landscape && styles.portalContentMobile]} showsVerticalScrollIndicator={false}>
      {bakery && <NativePickupConfirmation occurrence={workspace.pickupOccurrences.find((occurrence) => occurrence.serviceDate === localDateString(new Date()))} onChanged={onChanged} />}
      {workspace.notifications.slice(0, 3).map((notification) => <PartnerMobileNotificationCard notification={notification} onChanged={onChanged} key={notification.id} />)}
      <View style={[styles.portalStatusCard, !landscape && styles.portalStatusCardMobile]}>
        <View style={styles.portalStatusCopy}>
          <View style={styles.portalStatusLabel}><View style={[styles.portalStatusDot, paused && styles.portalStatusDotPaused]} /><Text style={styles.portalStatusLabelText}>{paused ? "AVAILABILITY PAUSED" : activeOneTime ? "ONE-TIME WINDOW OPEN" : "SCHEDULE CONNECTED"}</Text></View>
          <Text style={styles.portalStatusTitle}>{paused ? (bakery ? "Pickup availability is paused." : "Delivery availability is paused.") : bakery ? "Manage today’s pickup availability." : "Manage today’s delivery availability."}</Text>
          <Text style={styles.portalStatusBody}>{activeOneTime ? `${formatMobileDate(activeOneTime.startsAt)} · ${formatMobileTime(activeOneTime.startsAt)}–${formatMobileTime(activeOneTime.endsAt)}` : `Recurring days: ${workspace.organization.recurringDays || "No recurring schedule"}`}</Text>
        </View>
        <Pressable style={styles.portalStatusButton} onPress={() => onNavigate("schedule")}><Text style={styles.portalStatusButtonText}>{bakery ? "View pickup schedule" : "View receiving schedule"}</Text></Pressable>
      </View>
      <View style={[styles.portalMetrics, !landscape && styles.portalMetricsMobile]}>
        <MetricCard value={upcoming?.scheduledArrival ?? "—"} label="Next arrival" />
        <MetricCard value={String(thisMonth.length)} label="Deliveries this month" />
        <MetricCard value={String(completed.length)} label="Completed orders" />
      </View>
      <View style={styles.portalPanel}>
        <View style={styles.portalPanelHeading}><View><Text style={styles.portalPanelKicker}>RECENT ACTIVITY</Text><Text style={styles.portalPanelTitle}>Delivery updates</Text></View><Pressable onPress={() => onNavigate("activity")}><Text style={styles.portalPanelLink}>View all</Text></Pressable></View>
        <RouteList routes={workspace.routes.slice(0, 3)} bakery={bakery} />
      </View>
    </ScrollView>;
  }
  if (section === "activity") return <ActivityPage workspace={workspace} bakery={bakery} rightInset={rightInset} />;
  if (section === "schedule") return <SchedulePage workspace={workspace} bakery={bakery} rightInset={rightInset} onChanged={onChanged} />;
  return <ProfilePage workspace={workspace} bakery={bakery} rightInset={rightInset} onChanged={onChanged} />;
}

function NativePickupConfirmation({ occurrence, onChanged }: { occurrence?: PickupOccurrence; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function respond(status: "confirmed" | "decision_deferred" | "insufficient_food") {
    if (!occurrence) return;
    if (status === "confirmed") {
      const accepted = await new Promise<boolean>((resolve) => Alert.alert(
        "Confirm today’s pickup?",
        "Drivers may reserve this pickup after you confirm that food will be available.",
        [{ text: "Cancel", style: "cancel", onPress: () => resolve(false) }, { text: "Confirm pickup", onPress: () => resolve(true) }],
      ));
      if (!accepted) return;
    }
    setBusy(true);
    const { response, data } = await workspaceRequest("PATCH", { action: "update-pickup-occurrence", id: occurrence.id, status });
    setBusy(false);
    if (!response.ok) return Alert.alert("Could not update pickup", data.error ?? "Please try again.");
    await onChanged();
    if (status === "confirmed") Alert.alert("Pickup confirmed", data.matching?.matchedRequests ? `${data.matching.matchedRequests} saved driver requests matched this pickup.` : "This pickup is now available for driver matching.");
  }
  if (!occurrence) return null;
  const confirmed = ["confirmed", "reserved"].includes(occurrence.status);
  const unavailable = ["insufficient_food", "cancelled"].includes(occurrence.status);
  return <View style={[styles.nativePickupConfirmation, confirmed && styles.nativePickupConfirmed, unavailable && styles.nativePickupUnavailable]}>
    <Text style={styles.portalPanelKicker}>TODAY’S PICKUP COMMITMENT</Text>
    <Text style={styles.portalPanelTitle}>{occurrence.status === "reserved" ? "A driver reserved this pickup." : confirmed ? "Pickup confirmed." : unavailable ? "No pickup today." : occurrence.status === "decision_deferred" ? "Decision postponed." : "Will food be available?"}</Text>
    <Text style={styles.portalFeatureBody}>{formatMobileTime(occurrence.pickupWindowStartsAt)}–{formatMobileTime(occurrence.pickupDeadline)} · {confirmed ? "Available for advance matching." : "Confirming allows drivers to reserve this pickup."}</Text>
    {!confirmed && !unavailable && <View style={styles.nativePickupActions}><Pressable disabled={busy} style={styles.nativeConfirmPickup} onPress={() => respond("confirmed")}><Text style={styles.portalStatusButtonText}>Confirm pickup</Text></Pressable><Pressable disabled={busy} onPress={() => respond("decision_deferred")}><Text style={styles.offerDeclineText}>Decide later</Text></Pressable><Pressable disabled={busy} onPress={() => respond("insufficient_food")}><Text style={styles.offerDeclineText}>Not enough food</Text></Pressable></View>}
  </View>;
}

function PartnerMobileNotificationCard({ notification, onChanged }: { notification: DriverNotification; onChanged: () => Promise<void> }) {
  async function acknowledge() {
    try {
      await mobileNotificationsRequest("PATCH", { id: notification.id, acknowledge: true });
      await onChanged();
    } catch (reason) {
      Alert.alert("Could not acknowledge notification", reason instanceof Error ? reason.message : "Please try again.");
    }
  }
  return <View style={styles.driverNotificationCard}>
    <Text style={styles.authEyebrow}>{notification.actionRequired ? "ACTION REQUIRED" : "DELIVERY UPDATE"}</Text>
    <Text style={styles.connectedTitle}>{notification.title}</Text>
    <Text style={styles.connectedBody}>{notification.body}</Text>
    {notification.actionRequired && !notification.acknowledgedAt && <Pressable style={styles.nativeNotificationButton} onPress={acknowledge}><Text style={styles.portalStatusButtonText}>Acknowledge</Text></Pressable>}
    {notification.acknowledgedAt && <Text style={styles.nativeAcknowledged}>✓ Acknowledged</Text>}
  </View>;
}

function mobileBakeryWindowForToday(workspace: WorkspaceData) {
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
  try {
    const ready = JSON.parse(workspace.organization.readyTime ?? "{}") as Record<string, string>;
    const deadlines = JSON.parse(workspace.organization.arrivalDeadline ?? "{}") as Record<string, string>;
    return ready[day] && deadlines[day] ? { readyTime: ready[day], pickupDeadline: deadlines[day] } : null;
  } catch {
    return null;
  }
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return <View style={styles.portalMetricCard}><Text style={styles.portalMetricValue}>{value}</Text><Text style={styles.portalMetricLabel}>{label}</Text></View>;
}

function WorkspaceMessage({ title, body }: { title: string; body: string }) {
  return <View style={styles.workspaceMessage}><Text style={styles.portalEmptyTitle}>{title}</Text><Text style={styles.portalEmptyBody}>{body}</Text></View>;
}

function RouteList({ routes, bakery }: { routes: MobileRoute[]; bakery: boolean }) {
  if (!routes.length) return <View style={styles.portalEmpty}><Text style={styles.portalEmptyTitle}>No deliveries yet</Text><Text style={styles.portalEmptyBody}>Reserved, ongoing, and completed deliveries will appear here automatically.</Text></View>;
  return <View style={styles.routeList}>{routes.map((route) => <View style={styles.routeRow} key={route.id}>
    <View style={[styles.routeDot, route.status === "completed" && styles.routeDotComplete]} />
    <View style={styles.routeCopy}><Text style={styles.routeTitle}>{bakery ? `Delivery to ${route.pantryName}` : `Delivery from ${route.bakeryName}`}</Text><Text style={styles.routeDetail}>{route.driverName} · {route.scheduledArrival}</Text></View>
    <Text style={styles.routeStatus}>{route.status}</Text>
  </View>)}</View>;
}

function ActivityPage({ workspace, bakery, rightInset }: { workspace: WorkspaceData; bakery: boolean; rightInset: number }) {
  return <ScrollView contentContainerStyle={[styles.portalContent, { paddingRight: 28 + rightInset }]}>
    <View style={styles.portalPanel}>
      <Text style={styles.portalPanelKicker}>DELIVERY HISTORY</Text>
      <Text style={styles.portalFeatureBody}>Reserved, ongoing, and completed deliveries are synchronized with the BakedBoston web portal.</Text>
      <RouteList routes={workspace.routes} bakery={bakery} />
    </View>
  </ScrollView>;
}

type NativeScheduleRow = { recurrence: "weekly" | "monthly"; day: string; ordinal: number | null; open: string; close: string; latestArrival: string; readyTime: string; pickupDeadline: string };
type ScheduleSelection = { type: "recurring"; index: number; date?: string } | { type: "one-time"; id: number } | null;

function SchedulePage({ workspace, bakery, rightInset, onChanged }: { workspace: WorkspaceData; bakery: boolean; rightInset: number; onChanged: () => Promise<void> }) {
  const [rows, setRows] = useState<NativeScheduleRow[]>(() => nativeScheduleRows(workspace, bakery));
  const [selected, setSelected] = useState<ScheduleSelection>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setRows(nativeScheduleRows(workspace, bakery)), [workspace, bakery]);
  async function saveRows(nextRows = rows) {
    setBusy(true); setNotice("");
    const { response, data } = await workspaceRequest("PATCH", { action: "save-schedule", windows: nextRows });
    setBusy(false);
    if (!response.ok) return setNotice(data.error ?? "Could not save schedule.");
    setNotice("Recurring schedule saved.");
    await onChanged();
  }
  function addRecurring() {
    const next = [...rows, emptyNativeScheduleRow()];
    setRows(next); setSelected({ type: "recurring", index: next.length - 1 });
  }
  async function removeRecurring(index: number) {
    if (rows.length <= 1) return setNotice("At least one recurring window is required.");
    const next = rows.filter((_, rowIndex) => rowIndex !== index);
    setRows(next); setSelected(null); await saveRows(next);
  }
  return <ScrollView contentContainerStyle={[styles.portalContent, { paddingRight: 28 + rightInset }]}>
    <View style={styles.portalPanel}>
      <Text style={[styles.portalFeatureBody, styles.calendarInstructions]}>Select a time slot to edit or delete it. Add new recurring times or one-time delivery availability.</Text>
      <View style={styles.calendarActions}><Pressable style={styles.calendarAddButton} onPress={() => setSelected({ type: "one-time", id: -1 })}><Text style={styles.calendarAddButtonText}>+ Add one-time window</Text></Pressable><Pressable style={[styles.calendarAddButton, styles.calendarAddButtonPrimary]} onPress={addRecurring}><Text style={[styles.calendarAddButtonText, styles.calendarAddButtonTextPrimary]}>+ Add recurring window</Text></Pressable></View>
      {notice ? <Text style={styles.calendarNotice}>{notice}</Text> : null}
      {selected?.type === "recurring" && rows[selected.index] ? <RecurringNativeEditor row={rows[selected.index]} bakery={bakery} date={selected.date} busy={busy} onChange={(patch) => setRows((current) => current.map((row, index) => index === selected.index ? { ...row, ...patch } : row))} onClose={() => setSelected(null)} onSave={() => saveRows()} onDelete={() => removeRecurring(selected.index)} onCancelDate={selected.date ? async () => {
        const { response, data } = await workspaceRequest("POST", { action: "cancel-occurrence", exceptionDate: selected.date });
        if (response.ok) { setSelected(null); await onChanged(); } else setNotice(data.error ?? "Could not cancel this occurrence.");
      } : undefined} /> : null}
      {selected?.type === "one-time" ? <OneTimeNativeEditor window={workspace.availabilityWindows.find((window) => window.id === selected.id)} bakery={bakery} onClose={() => setSelected(null)} onSaved={async (message) => { setNotice(message); setSelected(null); await onChanged(); }} /> : null}
      <FourWeekNativeCalendar bakery={bakery} rows={rows} windows={workspace.availabilityWindows} exceptions={workspace.scheduleExceptions} onRecurring={(index, date) => setSelected({ type: "recurring", index, date })} onOneTime={(id) => setSelected({ type: "one-time", id })} onRestore={async (id) => {
        const exception = workspace.scheduleExceptions.find((item) => item.id === id);
        if (!exception || !(await confirmRestore(exception.exceptionDate))) return;
        const { response, data } = await workspaceRequest("DELETE", undefined, `?type=exception&id=${id}`);
        if (response.ok) await onChanged(); else setNotice(data.error ?? "Could not restore scheduled hours.");
      }} />
    </View>
  </ScrollView>;
}

function RecurringNativeEditor({ row, bakery, date, busy, onChange, onClose, onSave, onDelete, onCancelDate }: {
  row: NativeScheduleRow; bakery: boolean; date?: string; busy: boolean; onChange: (patch: Partial<NativeScheduleRow>) => void; onClose: () => void; onSave: () => void; onDelete: () => void; onCancelDate?: () => void;
}) {
  const { width, height } = useWindowDimensions(); const compact = width > height;
  const heading = <View style={styles.editorHeading}><Text style={styles.portalPanelKicker}>EDIT WINDOW</Text><Pressable onPress={onClose}><Text style={styles.editorClose}>×</Text></Pressable></View>;
  const days = <View style={[styles.choiceRow, compact && styles.landscapeDayRow]}>{nativeDays.map((day) => <Pressable key={day} onPress={() => onChange({ day })} style={[styles.choicePill, compact && styles.landscapeDayPill, row.day === day && styles.choicePillSelected]}><Text style={[styles.choiceText, row.day === day && styles.choiceTextSelected]}>{day}</Text></Pressable>)}</View>;
  const recurrence = !bakery ? <View style={[styles.choiceRow, compact && styles.landscapeRecurrence]}><Pressable onPress={() => onChange({ recurrence: "weekly", ordinal: null })} style={[styles.choicePill, row.recurrence === "weekly" && styles.choicePillSelected]}><Text style={[styles.choiceText, row.recurrence === "weekly" && styles.choiceTextSelected]}>Every week</Text></Pressable><Pressable onPress={() => onChange({ recurrence: "monthly", ordinal: row.ordinal ?? 1 })} style={[styles.choicePill, row.recurrence === "monthly" && styles.choicePillSelected]}><Text style={[styles.choiceText, row.recurrence === "monthly" && styles.choiceTextSelected]}>Once a month</Text></Pressable></View> : null;
  const fields = <View style={[styles.editorFieldsRow, compact && styles.landscapeTimeFields]}>{!bakery && row.recurrence === "monthly" && <EditorField label="Occurrence" value={String(row.ordinal ?? 1)} onChangeText={(value) => onChange({ ordinal: Number(value) || 1 })} />}{bakery ? <><TimeEditorField label="Food ready" value={row.readyTime} onChange={(readyTime) => onChange({ readyTime })} /><TimeEditorField label="Pickup deadline" value={row.pickupDeadline} onChange={(pickupDeadline) => onChange({ pickupDeadline })} /></> : <><TimeEditorField label="Opens" value={row.open} onChange={(open) => onChange({ open })} /><TimeEditorField label="Closes" value={row.close} onChange={(close) => onChange({ close })} /><TimeEditorField label="Latest arrival" value={row.latestArrival} onChange={(latestArrival) => onChange({ latestArrival })} /></>}</View>;
  const actions = <View style={[styles.editorActions, compact && styles.landscapeEditorActions]}><Pressable style={styles.editorDeleteButton} onPress={onDelete}><Text style={styles.editorDeleteButtonText}>Delete window</Text></Pressable>{onCancelDate && <Pressable style={styles.editorCancelButton} onPress={onCancelDate}><Text style={styles.editorCancelButtonText}>Cancel hours on {date}</Text></Pressable>}<Pressable style={[styles.saveAction, compact && styles.landscapeSaveAction]} onPress={onSave} disabled={busy}><Text style={styles.saveActionText}>{busy ? "Saving…" : "Save changes"}</Text></Pressable></View>;
  if (compact) return <View style={styles.nativeEditor}>{heading}<View style={styles.landscapeRecurrenceBelowTitle}>{recurrence}</View>{days}<View style={styles.landscapeEditorBottom}>{fields}</View>{actions}</View>;
  return <View style={styles.nativeEditor}>{heading}{recurrence}{days}{fields}{actions}</View>;
}

function OneTimeNativeEditor({ window, bakery, onClose, onSaved }: { window?: MobileWindow; bakery: boolean; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const { width, height } = useWindowDimensions(); const compact = width > height;
  const start = window ? new Date(window.startsAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = window ? new Date(window.endsAt) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const latest = window ? new Date(window.latestArrival) : new Date(end.getTime() - 15 * 60 * 1000);
  const [draft, setDraft] = useState({ date: localDateString(start), starts: localTimeString(start), ends: localTimeString(end), latest: localTimeString(latest) });
  const [error, setError] = useState("");
  async function save() {
    const startsAt = new Date(`${draft.date}T${draft.starts}:00`).toISOString();
    const endsAt = new Date(`${draft.date}T${draft.ends}:00`).toISOString();
    const latestArrival = bakery ? endsAt : new Date(`${draft.date}T${draft.latest}:00`).toISOString();
    const { response, data } = await workspaceRequest(window ? "PATCH" : "POST", { ...(window ? { id: window.id } : {}), startsAt, endsAt, latestArrival });
    if (response.ok) await onSaved(window ? "One-time window updated." : "One-time window created."); else setError(data.error ?? "Could not save window.");
  }
  async function remove() {
    if (!window) return;
    const { response, data } = await workspaceRequest("DELETE", undefined, `?id=${window.id}`);
    if (response.ok) await onSaved("One-time window deleted."); else setError(data.error ?? "Could not delete window.");
  }
  const heading = <View style={styles.editorHeading}><View><Text style={styles.portalPanelKicker}>{window ? "EDIT" : "ADD"} ONE-TIME</Text><Text style={styles.editorTitle}>{window ? formatMobileDate(window.startsAt) : "New window"}</Text></View><Pressable onPress={onClose}><Text style={styles.editorClose}>×</Text></Pressable></View>;
  const fields = <View style={[styles.editorFieldsRow, compact && styles.landscapeTimeFields]}><EditorField label="Date" value={draft.date} onChangeText={(date) => setDraft({ ...draft, date })} /><TimeEditorField label={bakery ? "Food ready" : "Opens"} value={draft.starts} onChange={(starts) => setDraft({ ...draft, starts })} /><TimeEditorField label={bakery ? "Pickup deadline" : "Closes"} value={draft.ends} onChange={(ends) => setDraft({ ...draft, ends })} />{!bakery && <TimeEditorField label="Latest arrival" value={draft.latest} onChange={(latestValue) => setDraft({ ...draft, latest: latestValue })} />}</View>;
  const actions = <View style={[styles.editorActions, compact && styles.landscapeEditorActions]}>{window && <Pressable style={styles.editorDeleteButton} onPress={remove}><Text style={styles.editorDeleteButtonText}>Delete window</Text></Pressable>}<Pressable style={[styles.saveAction, compact && styles.landscapeSaveAction]} onPress={save}><Text style={styles.saveActionText}>Save window</Text></Pressable></View>;
  if (compact) return <View style={styles.nativeEditor}>{heading}<View style={styles.landscapeEditorBottom}>{fields}</View>{error ? <Text style={styles.calendarNotice}>{error}</Text> : null}{actions}</View>;
  return <View style={styles.nativeEditor}>{heading}{fields}{error ? <Text style={styles.calendarNotice}>{error}</Text> : null}{actions}</View>;
}

function FourWeekNativeCalendar({ bakery, rows, windows, exceptions, onRecurring, onOneTime, onRestore }: {
  bakery: boolean; rows: NativeScheduleRow[]; windows: MobileWindow[]; exceptions: WorkspaceData["scheduleExceptions"]; onRecurring: (index: number, date: string) => void; onOneTime: (id: number) => void; onRestore: (id: number) => void;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - start.getDay());
  const dates = Array.from({ length: 28 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  return <View style={styles.nativeCalendar}><View style={styles.calendarMonthHeading}><Text style={styles.editorTitle}>{today.toLocaleDateString([], { month: "long", year: "numeric" })}</Text><Text style={styles.routeDetail}>Next four weeks</Text></View><View style={styles.calendarWeekHeader}>{nativeDays.map((day) => <Text style={styles.calendarWeekDay} key={day}>{day}</Text>)}</View><View style={styles.calendarGrid}>{dates.map((date) => {
    const dateString = localDateString(date); const day = nativeDays[date.getDay()]; const occurrence = Math.ceil(date.getDate() / 7);
    const exception = exceptions.find((item) => item.exceptionDate === dateString);
    const recurring = exception ? [] : rows.map((row, index) => ({ row, index })).filter(({ row }) => row.day === day && (row.recurrence === "weekly" || row.ordinal === occurrence));
    const dated = windows.filter((window) => localDateString(new Date(window.startsAt)) === dateString);
    return <View style={[styles.calendarCell, dateString === localDateString(today) && styles.calendarCellToday]} key={dateString}><Text style={styles.calendarDateNumber}>{date.getDate()}</Text>{exception ? <Pressable style={styles.cancelledCalendarEvent} onPress={() => onRestore(exception.id)}><Text style={styles.calendarEventText}>Cancelled</Text><Text style={styles.calendarEventTime}>Tap to restore</Text></Pressable> : null}{recurring.map(({ row, index }) => <Pressable style={styles.recurringCalendarEvent} key={`r-${index}`} onPress={() => onRecurring(index, dateString)}><Text style={styles.calendarEventText}>Recurring</Text><Text style={styles.calendarEventTime}>{displayClock(bakery ? row.readyTime : row.open)}–{displayClock(bakery ? row.pickupDeadline : row.close)}</Text>{!bakery && <Text style={styles.calendarEventTime}>Latest {displayClock(row.latestArrival)}</Text>}</Pressable>)}{dated.map((window) => <Pressable style={styles.oneTimeCalendarEvent} key={window.id} onPress={() => onOneTime(window.id)}><Text style={styles.calendarEventText}>{window.paused ? "Paused" : "One-time"}</Text><Text style={styles.calendarEventTime}>{formatMobileTime(window.startsAt)}–{formatMobileTime(window.endsAt)}</Text></Pressable>)}</View>;
  })}</View></View>;
}

function EditorField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return <View style={styles.editorField}><Text style={styles.informationLabel}>{label}</Text><TextInput style={styles.editorInput} value={value} onChangeText={onChangeText} autoCapitalize="none" autoCorrect={false} /></View>;
}

function TimeEditorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(() => americanTime(value));
  useEffect(() => setText(americanTime(value)), [value]);
  function commit() {
    const parsed = parseAmericanTime(text);
    if (parsed) {
      onChange(parsed);
      setText(americanTime(parsed));
    } else {
      setText(americanTime(value));
    }
  }
  return <View style={styles.editorField}><Text style={styles.informationLabel}>{label}</Text><TextInput style={styles.editorInput} value={text} onChangeText={(next) => { setText(next); const parsed = parseAmericanTime(next); if (parsed) onChange(parsed); }} onBlur={commit} placeholder="9:00 AM" autoCapitalize="characters" autoCorrect={false} /></View>;
}

async function workspaceRequest(method: "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>, query = "") {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const response = await fetch(`${API_URL}/api/mobile/workspace${query}`, {
    method,
    headers: { Authorization: `Bearer ${token ?? ""}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, data: await response.json().catch(() => ({})) };
}

async function mobileNotificationsRequest(method: "GET" | "PATCH", body?: Record<string, unknown>) {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const response = await fetch(`${API_URL}/api/mobile/notifications`, {
    method,
    headers: { Authorization: `Bearer ${token ?? ""}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Could not synchronize notifications.");
  return data as { notifications: DriverNotification[]; pickupOccurrences: PickupOccurrence[] };
}

function confirmRestore(date: string) {
  return new Promise<boolean>((resolve) => {
    const label = new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    Alert.alert("Restore scheduled hours?", `This will undo the cancellation and restore the recurring availability on ${label}.`, [
      { text: "Keep cancelled", style: "cancel", onPress: () => resolve(false) },
      { text: "Restore hours", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

const nativeDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function emptyNativeScheduleRow(): NativeScheduleRow { return { recurrence: "weekly", day: "Mon", ordinal: null, open: "09:00", close: "17:00", latestArrival: "16:30", readyTime: "15:00", pickupDeadline: "18:00" }; }
function nativeScheduleRows(workspace: WorkspaceData, bakery: boolean): NativeScheduleRow[] {
  try {
    if (bakery) {
      const ready = JSON.parse(workspace.organization.readyTime ?? "{}") as Record<string, string>;
      const deadlines = JSON.parse(workspace.organization.arrivalDeadline ?? "{}") as Record<string, string>;
      const rows = Object.keys(ready).map((day) => ({ ...emptyNativeScheduleRow(), day, readyTime: ready[day], pickupDeadline: deadlines[day] ?? "18:00" }));
      return rows.length ? rows : [emptyNativeScheduleRow()];
    }
    const opens = JSON.parse(workspace.organization.openTime ?? "[]") as Array<{ day: string; time: string; recurrence?: "weekly" | "monthly"; ordinal?: number | null }>;
    const closes = JSON.parse(workspace.organization.closeTime ?? "[]") as Array<{ time: string }>;
    const latest = JSON.parse(workspace.organization.latestArrival ?? "[]") as Array<{ time: string }>;
    const rows = opens.map((open, index) => ({ ...emptyNativeScheduleRow(), recurrence: open.recurrence ?? "weekly", day: open.day, ordinal: open.ordinal ?? null, open: open.time, close: closes[index]?.time ?? "17:00", latestArrival: latest[index]?.time ?? "16:30" }));
    return rows.length ? rows : [emptyNativeScheduleRow()];
  } catch { return [emptyNativeScheduleRow()]; }
}
function localDateString(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function mobileLocalDateTime(date: string, time: string) { return new Date(`${date}T${time}:00`).toISOString(); }
function localTimeString(value: Date) { return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`; }
function americanTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}
function parseAmericanTime(value: string) {
  const match = /^\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*$/i.exec(value);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2] ?? "00");
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (match[3].toUpperCase() === "AM") hour %= 12;
  else hour = hour % 12 + 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function ProfilePage({ workspace, bakery, rightInset, onChanged }: { workspace: WorkspaceData; bakery: boolean; rightInset: number; onChanged: () => Promise<void> }) {
  const { width, height } = useWindowDimensions(); const landscape = width > height;
  const [draft, setDraft] = useState({ accountEmail: workspace.account.accountEmail, address: workspace.organization.address, dropoffInstructions: workspace.organization.dropoffInstructions, businessPhone: workspace.organization.businessPhone, notificationPhone: workspace.organization.notificationPhone });
  const [contactDraft, setContactDraft] = useState({ name: "", email: "", phone: "" });
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => setDraft({ accountEmail: workspace.account.accountEmail, address: workspace.organization.address, dropoffInstructions: workspace.organization.dropoffInstructions, businessPhone: workspace.organization.businessPhone, notificationPhone: workspace.organization.notificationPhone }), [workspace]);
  async function saveProfile() {
    const { response, data } = await workspaceRequest("PATCH", { action: "update-profile", ...draft });
    setNotice(response.ok ? "Profile saved." : data.error ?? "Could not save profile.");
    if (response.ok) await onChanged();
  }
  async function addContact() {
    const { response, data } = await workspaceRequest("POST", { action: "add-contact", ...contactDraft });
    setNotice(response.ok ? "Contact added." : data.error ?? "Could not add contact.");
    if (response.ok) { setContactDraft({ name: "", email: "", phone: "" }); await onChanged(); }
  }
  async function makePrimary(id: number) {
    const { response, data } = await workspaceRequest("PATCH", { action: "make-primary-contact", id });
    setNotice(response.ok ? "Primary contact updated." : data.error ?? "Could not update primary contact.");
    if (response.ok) await onChanged();
  }
  async function deleteContact(id: number) {
    const { response, data } = await workspaceRequest("DELETE", undefined, `?type=contact&id=${id}`);
    setNotice(response.ok ? "Contact deleted." : data.error ?? "Could not delete contact.");
    if (response.ok) await onChanged();
  }
  async function choosePhoto(source: "camera" | "library") {
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return setNotice("Camera permission is required to take a photo.");
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) return setNotice("Photo-library permission is required to choose a photo.");
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (!result.canceled) setPhoto(result.assets[0]);
    } catch {
      setNotice(source === "camera" ? "The camera is not available on this device." : "Could not open the photo library.");
    }
  }
  async function uploadPhoto() {
    if (!photo) return;
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const form = new FormData();
    form.append("photo", { uri: photo.uri, name: photo.fileName ?? `access-photo-${Date.now()}.jpg`, type: photo.mimeType ?? "image/jpeg" } as unknown as Blob);
    form.append("caption", caption);
    const response = await fetch(`${API_URL}/api/mobile/photos`, { method: "POST", headers: { Authorization: `Bearer ${token ?? ""}` }, body: form });
    const data = await response.json().catch(() => ({}));
    setNotice(response.ok ? "Access photo uploaded." : data.error ?? "Could not upload photo.");
    if (response.ok) { setPhoto(null); setCaption(""); await onChanged(); }
  }
  async function deletePhoto(id: number) {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const response = await fetch(`${API_URL}/api/mobile/photos?id=${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token ?? ""}` } });
    const data = await response.json().catch(() => ({}));
    setNotice(response.ok ? "Access photo deleted." : data.error ?? "Could not delete photo.");
    if (response.ok) await onChanged();
  }
  return <ScrollView contentContainerStyle={[styles.portalContent, { paddingRight: 28 + rightInset }]}>
    <View style={styles.portalPanel}>
      <Text style={styles.portalPanelKicker}>ORGANIZATION SETTINGS</Text>
      <Text style={styles.portalFeatureBody}>Keep login, organization, and primary contact information current.</Text>
      {notice ? <Text style={styles.calendarNotice}>{notice}</Text> : null}
      <Text style={styles.subsectionTitle}>Login</Text>
      <EditorField label="Account email" value={draft.accountEmail} onChangeText={(accountEmail) => setDraft({ ...draft, accountEmail })} />
      <Text style={styles.subsectionTitle}>Organization channels</Text>
      <View style={styles.profileFieldsGrid}><View style={landscape ? styles.profileFieldLandscape : styles.profileFieldPortrait}><EditorField label={bakery ? "Business address" : "Delivery address"} value={draft.address} onChangeText={(address) => setDraft({ ...draft, address })} /></View><View style={landscape ? styles.profileFieldLandscape : styles.profileFieldPortrait}><EditorField label={bakery ? "Pickup instructions" : "Drop-off instructions"} value={draft.dropoffInstructions} onChangeText={(dropoffInstructions) => setDraft({ ...draft, dropoffInstructions })} /></View><View style={landscape ? styles.profileFieldLandscape : styles.profileFieldPortrait}><EditorField label="Business phone number" value={draft.businessPhone} onChangeText={(businessPhone) => setDraft({ ...draft, businessPhone })} /></View><View style={landscape ? styles.profileFieldLandscape : styles.profileFieldPortrait}><EditorField label="Notification contact" value={draft.notificationPhone} onChangeText={(notificationPhone) => setDraft({ ...draft, notificationPhone })} /></View></View>
      <Pressable style={styles.saveProfileButton} onPress={saveProfile}><Text style={styles.saveActionText}>Save profile</Text></Pressable>
      <Text style={styles.subsectionTitle}>{bakery ? "Bakery" : "Pantry"} access photos <Text style={styles.optionalLabel}>Optional</Text></Text>
      <Text style={styles.profileHelp}>Add photos that help drivers recognize the correct {bakery ? "pickup" : "drop-off"} location.</Text>
      {workspace.photos.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accessPhotoList}>{workspace.photos.map((item) => <View style={styles.accessPhotoCard} key={item.id}><Image source={{ uri: item.imageUrl }} style={styles.accessPhotoImage} /><Text style={styles.accessPhotoCaption} numberOfLines={2}>{item.caption || "Access photo"}</Text><Pressable onPress={() => deletePhoto(item.id)}><Text style={styles.contactDelete}>Delete</Text></Pressable></View>)}</ScrollView>}
      <View style={styles.photoUploadPanel}>{photo && <Image source={{ uri: photo.uri }} style={styles.photoPreview} />}<View style={styles.photoUploadControls}><View style={styles.photoSourceButtons}><Pressable style={styles.calendarAddButton} onPress={() => choosePhoto("camera")}><Text style={styles.calendarAddButtonText}>Take photo</Text></Pressable><Pressable style={styles.calendarAddButton} onPress={() => choosePhoto("library")}><Text style={styles.calendarAddButtonText}>Choose photo</Text></Pressable></View><EditorField label="Caption" value={caption} onChangeText={setCaption} /><Pressable style={[styles.addContactButton, !photo && styles.disabledButton]} disabled={!photo} onPress={uploadPhoto}><Text style={styles.saveActionText}>Upload photo</Text></Pressable></View></View>
      <Text style={styles.subsectionTitle}>Organizational contacts</Text>
      {workspace.contacts.map((contact) => <View style={styles.contactRow} key={contact.id}><View style={styles.contactCopy}><Text style={styles.routeTitle}>{contact.isPrimary ? "★ " : ""}{contact.name}</Text><Text style={styles.routeDetail}>{contact.email} · {contact.phone}</Text></View>{contact.isPrimary ? <Text style={styles.primaryPill}>PRIMARY</Text> : <Pressable onPress={() => makePrimary(contact.id)}><Text style={styles.contactAction}>Make primary</Text></Pressable>}<Pressable disabled={workspace.contacts.length <= 1} onPress={() => deleteContact(contact.id)}><Text style={[styles.contactDelete, workspace.contacts.length <= 1 && styles.contactDisabled]}>Delete</Text></Pressable></View>)}
      <View style={styles.contactDraft}><EditorField label="Contact name" value={contactDraft.name} onChangeText={(name) => setContactDraft({ ...contactDraft, name })} /><EditorField label="Contact email" value={contactDraft.email} onChangeText={(email) => setContactDraft({ ...contactDraft, email })} /><EditorField label="Contact phone" value={contactDraft.phone} onChangeText={(phone) => setContactDraft({ ...contactDraft, phone })} /><Pressable style={styles.addContactButton} disabled={!contactDraft.name || !contactDraft.email || !contactDraft.phone} onPress={addContact}><Text style={styles.saveActionText}>+ Add contact</Text></Pressable></View>
    </View>
  </ScrollView>;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "BB";
}

function formatMobileDate(value: string) {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatMobileTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function displayClock(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour)) return value;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function mobileScheduleRows(workspace: WorkspaceData, bakery: boolean) {
  try {
    if (bakery) {
      const ready = JSON.parse(workspace.organization.readyTime ?? "{}") as Record<string, string>;
      const deadlines = JSON.parse(workspace.organization.arrivalDeadline ?? "{}") as Record<string, string>;
      return Object.keys(ready).map((day) => ({ day, primary: `${displayClock(ready[day])}–${displayClock(deadlines[day] ?? ready[day])}`, secondary: "Food ready–pickup deadline" }));
    }
    const opens = JSON.parse(workspace.organization.openTime ?? "[]") as Array<{ day: string; time: string; recurrence?: string; ordinal?: number | null }>;
    const closes = JSON.parse(workspace.organization.closeTime ?? "[]") as Array<{ time: string }>;
    const latest = JSON.parse(workspace.organization.latestArrival ?? "[]") as Array<{ time: string }>;
    return opens.map((open, index) => ({
      day: open.recurrence === "monthly" ? `${open.ordinal ?? 1}${ordinalSuffix(open.ordinal ?? 1)} ${open.day}` : open.day,
      primary: `${displayClock(open.time)}–${displayClock(closes[index]?.time ?? open.time)}`,
      secondary: `Latest permitted arrival: ${displayClock(latest[index]?.time ?? closes[index]?.time ?? open.time)}`,
    }));
  } catch {
    return [{ day: "Schedule", primary: workspace.organization.recurringDays || "Not configured", secondary: "" }];
  }
}

function ordinalSuffix(value: number) {
  return value === 1 ? "st" : value === 2 ? "nd" : value === 3 ? "rd" : "th";
}

function PendingScreen({ role, onDone }: { role: Role | null; onDone: () => void }) {
  const isDriver = role === "driver";
  return <View style={styles.pending}>
    <View style={styles.pendingIcon}><Text style={styles.pendingIconText}>{isDriver ? "✓" : "⌛"}</Text></View>
    <Text style={styles.authEyebrow}>{isDriver ? "PROFILE STARTED" : "REQUEST RECEIVED"}</Text>
    <Text style={[styles.authTitle, styles.centerText]}>{isDriver ? "You’re almost ready." : "We’ll review your organization."}</Text>
    <Text style={[styles.authBody, styles.centerText]}>{isDriver
      ? "Email verification and the secure account connection will be enabled in the next backend milestone."
      : "A BakedBoston administrator will verify your organization before sending account setup instructions."}</Text>
    <PrimaryButton label="Return to welcome" dark onPress={onDone} />
  </View>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, multiline, ...inputProps } = props;
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput {...inputProps} multiline={multiline} placeholderTextColor="#9AA9A0"
      style={[styles.input, multiline && styles.multiline]} />
  </View>;
}

function PrimaryButton({ label, onPress, dark = false, disabled = false }: { label: string; onPress: () => void; dark?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.primaryButton, dark && styles.darkButton, disabled && styles.disabledButton, pressed && !disabled && styles.buttonPressed]}>
    <Text style={[styles.primaryButtonText, dark && styles.darkButtonText]}>{label}</Text>
    <Text style={[styles.buttonArrow, dark && styles.darkButtonText]}>→</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  portalSafe: { flex: 1, backgroundColor: colors.cream },
  portalShell: { flex: 1 },
  portalLandscape: { flexDirection: "row" },
  portalPortrait: { flexDirection: "column" },
  portalSidebar: { width: 238, backgroundColor: colors.forest, paddingHorizontal: 18, paddingTop: 20, borderRightWidth: 1, borderRightColor: "#315443" },
  portalBrand: { flexDirection: "row", alignItems: "center", gap: 8 },
  portalBrandText: { color: colors.forest, fontSize: 17, fontWeight: "900", letterSpacing: -0.5 },
  portalBrandTextLight: { color: colors.white },
  portalOrganization: { flexDirection: "row", alignItems: "center", gap: 11, marginTop: 30, paddingVertical: 17, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#315443" },
  portalOrganizationIcon: { fontSize: 24 },
  portalOrganizationCopy: { flex: 1 },
  portalOrganizationType: { color: "#9CB6A8", fontSize: 7, fontWeight: "900", letterSpacing: 1.2 },
  portalOrganizationName: { color: colors.white, fontSize: 13, lineHeight: 17, fontWeight: "800", marginTop: 4 },
  portalSideNav: { gap: 6, marginTop: 24 },
  portalSideNavButton: { minHeight: 43, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 8, paddingHorizontal: 12 },
  portalSideNavSelected: { backgroundColor: "#2C5542" },
  portalNavIcon: { color: "#A7BDB1", width: 18, fontSize: 16, textAlign: "center" },
  portalSideNavLabel: { color: "#C1D0C8", fontSize: 11, fontWeight: "700", flex: 1 },
  portalNavSelectedText: { color: colors.white },
  portalSideBottom: { marginTop: "auto", paddingTop: 20, paddingBottom: 28, borderTopWidth: 1, borderColor: "#315443", gap: 8 },
  portalAccountEmail: { color: "#A7BDB1", fontSize: 9 },
  portalSignOut: { color: colors.coral, fontSize: 10, fontWeight: "900" },
  portalMobileHeader: { minHeight: 62, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.paper, borderBottomWidth: 1, borderColor: colors.border },
  portalMobileRole: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: colors.mint, borderRadius: 15 },
  portalMobileRoleText: { color: colors.forest, fontSize: 8, fontWeight: "900", textTransform: "uppercase" },
  portalMobileNav: { flexGrow: 0, backgroundColor: colors.paper, borderBottomWidth: 1, borderColor: colors.border },
  portalMobileNavContent: { paddingHorizontal: 12, gap: 8, paddingVertical: 11 },
  portalMobileNavButton: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, borderRadius: 24, backgroundColor: "#F1EFE6" },
  portalMobileNavSelected: { backgroundColor: colors.forest },
  portalMobileNavLabel: { color: colors.forestSoft, fontSize: 11, fontWeight: "800" },
  portalMain: { flex: 1, backgroundColor: colors.cream },
  portalPageHeader: { minHeight: 98, paddingHorizontal: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.paper, borderBottomWidth: 1, borderColor: colors.border },
  portalPageHeaderMobile: { minHeight: 88, paddingHorizontal: 20 },
  portalKicker: { color: colors.coral, fontSize: 8, fontWeight: "900", letterSpacing: 1.4, marginBottom: 6 },
  portalPageTitle: { color: colors.forest, fontSize: 30, lineHeight: 35, fontWeight: "700", letterSpacing: -0.9 },
  portalPageTitleMobile: { fontSize: 25, lineHeight: 30 },
  portalAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.mint, borderWidth: 1, borderColor: "#C4D3C7" },
  portalAvatarText: { color: colors.forest, fontSize: 11, fontWeight: "900" },
  portalContent: { padding: 28, gap: 16 },
  portalContentMobile: { padding: 16, paddingBottom: 36 },
  portalStatusCard: { minHeight: 168, padding: 25, borderRadius: 14, backgroundColor: colors.forest, flexDirection: "row", alignItems: "center", gap: 20 },
  portalStatusCardMobile: { flexDirection: "column", alignItems: "stretch", padding: 21 },
  portalStatusCopy: { flex: 1 },
  portalStatusLabel: { flexDirection: "row", alignItems: "center", gap: 7 },
  portalStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#76C997" },
  portalStatusDotPaused: { backgroundColor: colors.yellow },
  portalStatusLabelText: { color: "#A9C3B5", fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  portalStatusTitle: { color: colors.white, fontSize: 21, lineHeight: 27, fontWeight: "800", marginTop: 11 },
  portalStatusBody: { color: "#B7CBC0", fontSize: 11, lineHeight: 17, marginTop: 8, maxWidth: 520 },
  portalStatusButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.coral, alignItems: "center", justifyContent: "center" },
  portalStatusButtonText: { color: colors.white, fontSize: 9, fontWeight: "900" },
  portalMetrics: { flexDirection: "row", gap: 12 },
  portalMetricsMobile: { flexDirection: "column" },
  portalMetricCard: { flex: 1, minHeight: 92, padding: 17, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  portalMetricValue: { color: colors.forest, fontSize: 25, fontWeight: "800" },
  portalMetricLabel: { color: colors.sage, fontSize: 9, fontWeight: "800", marginTop: 7 },
  portalPanel: { padding: 21, borderRadius: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  portalPanelHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  portalPanelKicker: { color: colors.coral, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  portalPanelTitle: { color: colors.forest, fontSize: 19, fontWeight: "800", marginTop: 5 },
  portalPanelLink: { color: colors.coral, fontSize: 9, fontWeight: "900" },
  portalEmpty: { minHeight: 105, alignItems: "center", justifyContent: "center", paddingTop: 18 },
  portalEmptyTitle: { color: colors.forest, fontSize: 14, fontWeight: "800" },
  portalEmptyBody: { color: colors.sage, fontSize: 10, lineHeight: 16, textAlign: "center", marginTop: 5 },
  workspaceMessage: { margin: 24, minHeight: 150, alignItems: "center", justifyContent: "center", padding: 24, borderRadius: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  routeList: { marginTop: 18 },
  routeRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 11, borderTopWidth: 1, borderTopColor: "#E5E9E4" },
  routeDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.yellow },
  routeDotComplete: { backgroundColor: "#76C997" },
  routeCopy: { flex: 1 },
  routeTitle: { color: colors.forest, fontSize: 11, fontWeight: "800" },
  routeDetail: { color: colors.sage, fontSize: 9, lineHeight: 14, marginTop: 3 },
  routeStatus: { color: colors.forestSoft, fontSize: 8, fontWeight: "900", textTransform: "uppercase" },
  scheduleList: { marginTop: 20, gap: 9 },
  scheduleRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 13, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: "#FBFAF4" },
  scheduleDayBadge: { minWidth: 66, minHeight: 38, paddingHorizontal: 8, borderRadius: 7, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" },
  scheduleDayText: { color: colors.white, fontSize: 8, fontWeight: "900", textAlign: "center" },
  scheduleCopy: { flex: 1 },
  scheduleTime: { color: colors.forest, fontSize: 12, fontWeight: "800" },
  scheduleLatest: { color: colors.sage, fontSize: 9, marginTop: 4 },
  subsectionTitle: { color: colors.forest, fontSize: 14, fontWeight: "900", marginTop: 25, marginBottom: 8 },
  oneTimeRow: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  informationRow: { paddingVertical: 13, borderTopWidth: 1, borderTopColor: colors.border },
  informationLabel: { color: colors.sage, fontSize: 8, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.7 },
  informationValue: { color: colors.forest, fontSize: 11, lineHeight: 17, fontWeight: "700", marginTop: 5 },
  contactRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  contactCopy: { flex: 1 },
  primaryPill: { color: colors.forest, fontSize: 7, fontWeight: "900", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.mint },
  contactAction: { color: colors.forestSoft, fontSize: 8, fontWeight: "900" },
  contactDelete: { color: "#A34436", fontSize: 8, fontWeight: "900" },
  contactDisabled: { opacity: 0.35 },
  profileFieldsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 16, columnGap: 14 },
  profileFieldLandscape: { width: "48%" },
  profileFieldPortrait: { width: "100%" },
  saveProfileButton: { alignSelf: "flex-end", minHeight: 42, marginTop: 14, paddingHorizontal: 18, borderRadius: 8, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" },
  contactDraft: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 10, marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: "#F5F1E5" },
  addContactButton: { minHeight: 39, paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center", marginBottom: 0 },
  optionalLabel: { color: colors.sage, fontSize: 9, fontWeight: "700" },
  profileHelp: { color: colors.sage, fontSize: 10, lineHeight: 16, marginBottom: 10 },
  accessPhotoList: { gap: 12, paddingVertical: 5 },
  accessPhotoCard: { width: 150, padding: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: "#FBFAF4" },
  accessPhotoImage: { width: "100%", height: 92, borderRadius: 7, backgroundColor: colors.mint },
  accessPhotoCaption: { minHeight: 28, color: colors.forestSoft, fontSize: 9, lineHeight: 13, fontWeight: "700", marginTop: 7 },
  photoUploadPanel: { flexDirection: "row", gap: 14, marginTop: 12, padding: 13, borderRadius: 10, backgroundColor: "#F5F1E5", borderWidth: 1, borderColor: colors.border },
  photoPreview: { width: 120, height: 100, borderRadius: 8, backgroundColor: colors.mint },
  photoUploadControls: { flex: 1, gap: 5 },
  photoSourceButtons: { flexDirection: "row", gap: 9 },
  calendarActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 15, alignItems: "stretch" },
  calendarAddButton: { minHeight: 44, minWidth: 155, flexGrow: 1, paddingHorizontal: 15, borderRadius: 8, borderWidth: 1, borderColor: colors.forest, alignItems: "center", justifyContent: "center" },
  calendarAddButtonPrimary: { backgroundColor: colors.forest },
  calendarAddButtonText: { color: colors.forest, fontSize: 9, fontWeight: "900" },
  calendarAddButtonTextPrimary: { color: colors.white },
  calendarSecondaryButton: { minHeight: 44, paddingHorizontal: 15, borderRadius: 8, borderWidth: 1, borderColor: colors.forest, alignItems: "center", justifyContent: "center" },
  calendarSecondaryText: { color: colors.forest, fontSize: 9, fontWeight: "900" },
  calendarNotice: { color: "#A34436", fontSize: 10, lineHeight: 15, fontWeight: "800", marginTop: 12 },
  calendarInstructions: { marginTop: 0, marginBottom: 0 },
  nativeEditor: { marginTop: 14, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 11, backgroundColor: "#F5F1E5", borderWidth: 1, borderColor: "#D5DCD5" },
  nativeEditorCompact: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 10 },
  landscapeEditorTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  landscapeOneTimeTop: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  landscapeOneTimeActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 9 },
  landscapeCloseButton: { width: 36, minHeight: 40, alignItems: "center", justifyContent: "center" },
  landscapeEditorBottom: { width: "100%", marginTop: 9 },
  landscapeEditorHeading: { width: 118, marginBottom: 0, flexShrink: 0 },
  landscapeScheduleControls: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  landscapeRecurrenceOnly: { marginLeft: "auto" },
  landscapeRecurrenceBelowTitle: { alignSelf: "flex-start", marginTop: -4 },
  landscapeDayRow: { width: "100%", flexWrap: "nowrap", marginTop: 8, marginBottom: 0, gap: 7 },
  landscapeDayPill: { flex: 1, minHeight: 36, paddingHorizontal: 8 },
  landscapeRecurrence: { flexWrap: "nowrap", marginBottom: 0 },
  landscapeTimeFields: { width: "100%", flex: 0, flexWrap: "nowrap", gap: 10 },
  landscapeEditorActions: { width: "100%", flexDirection: "row", flexWrap: "nowrap", justifyContent: "flex-end", marginTop: 10, gap: 9 },
  landscapeSaveAction: { minWidth: 130, marginLeft: 0 },
  editorHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 9 },
  editorHeadingCompact: { width: 92, marginBottom: 0, flexShrink: 0 },
  editorTitle: { color: colors.forest, fontSize: 17, fontWeight: "900", marginTop: 4 },
  editorClose: { color: colors.forest, fontSize: 27, lineHeight: 28 },
  editorChoices: {},
  editorChoicesCompact: { width: 200, flexShrink: 0 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  choicePill: { minHeight: 31, paddingHorizontal: 10, borderRadius: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  choicePillSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  choiceText: { color: colors.forestSoft, fontSize: 8, fontWeight: "900" },
  choiceTextSelected: { color: colors.white },
  editorFieldsRow: { flexDirection: "row", flexWrap: "wrap", gap: 9, flex: 1 },
  editorField: { flexGrow: 1, flexBasis: 86, marginTop: 5 },
  editorInput: { minHeight: 39, marginTop: 4, paddingHorizontal: 10, color: colors.forest, fontSize: 11, fontWeight: "700", backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  editorActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 11 },
  editorActionsCompact: { width: 92, flexDirection: "column", alignItems: "stretch", marginTop: 0, gap: 7 },
  deleteAction: { color: "#A34436", fontSize: 8, fontWeight: "900" },
  cancelDateAction: { color: "#A26A16", fontSize: 8, fontWeight: "900" },
  editorDeleteButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: "#A34436", alignItems: "center", justifyContent: "center" },
  editorDeleteButtonText: { color: "#A34436", fontSize: 8, fontWeight: "900" },
  editorCancelButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: "#A26A16", alignItems: "center", justifyContent: "center" },
  editorCancelButtonText: { color: "#A26A16", fontSize: 8, fontWeight: "900" },
  saveAction: { minHeight: 40, marginLeft: "auto", paddingHorizontal: 15, borderRadius: 8, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" },
  saveActionText: { color: colors.white, fontSize: 9, fontWeight: "900" },
  nativeCalendar: { marginTop: 22, borderWidth: 1, borderColor: colors.border, borderRadius: 11, overflow: "hidden", backgroundColor: colors.paper },
  calendarMonthHeading: { padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.border },
  calendarWeekHeader: { flexDirection: "row", backgroundColor: "#F1EFE6" },
  calendarWeekDay: { width: "14.2857%", paddingVertical: 8, color: colors.forestSoft, fontSize: 7, fontWeight: "900", textAlign: "center" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarCell: { width: "14.2857%", minHeight: 74, padding: 4, borderRightWidth: 1, borderBottomWidth: 1, borderColor: "#E0E5E0" },
  calendarCellToday: { backgroundColor: "#F4F8F2" },
  calendarDateNumber: { color: colors.forest, fontSize: 8, fontWeight: "900", marginBottom: 4 },
  recurringCalendarEvent: { padding: 4, marginBottom: 3, borderRadius: 4, backgroundColor: colors.mint },
  oneTimeCalendarEvent: { padding: 4, marginBottom: 3, borderRadius: 4, backgroundColor: "#F8E5B8" },
  cancelledCalendarEvent: { padding: 4, marginBottom: 3, borderRadius: 4, backgroundColor: "#F5D7D1" },
  calendarEventText: { color: colors.forest, fontSize: 7, fontWeight: "900" },
  calendarEventTime: { color: colors.forestSoft, fontSize: 6, lineHeight: 8, marginTop: 2 },
  portalFeatureTitle: { color: colors.forest, fontSize: 27, fontWeight: "800", marginTop: 8 },
  portalFeatureBody: { color: colors.sage, fontSize: 12, lineHeight: 19, marginTop: 10, maxWidth: 560 },
  portalFeatureButton: { alignSelf: "flex-start", minHeight: 44, paddingHorizontal: 18, borderRadius: 8, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center", marginTop: 25 },
  portalFeatureButtonText: { color: colors.white, fontSize: 10, fontWeight: "900" },
  welcomeSafe: { flex: 1, backgroundColor: colors.forest },
  workspaceSafe: { flex: 1, backgroundColor: colors.cream },
  workspaceHeader: { zIndex: 100, minHeight: 64, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.paper },
  workspaceBrand: { flex: 1, color: colors.forest, fontWeight: "900", fontSize: 18 },
  workspaceSignOut: { color: colors.coral, fontWeight: "800" },
  workspaceContent: { padding: 26, gap: 12 },
  driverHeaderStatus: { flexDirection: "row", alignItems: "center", gap: 7 },
  driverHeaderStatusText: { color: colors.forestSoft, fontSize: 9, fontWeight: "800" },
  driverAccountControl: { position: "relative", zIndex: 110 },
  driverAvatarButton: { minWidth: 54, height: 40, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mint },
  driverAvatarText: { color: colors.forest, fontSize: 11, fontWeight: "900" },
  driverAvatarChevron: { color: colors.forestSoft, fontSize: 10, fontWeight: "900" },
  driverAccountMenu: { position: "absolute", top: 47, right: 0, width: 245, padding: 15, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper, shadowColor: "#000", shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  driverAccountName: { color: colors.forest, fontSize: 14, fontWeight: "900" },
  driverAccountEmail: { marginTop: 4, color: colors.sage, fontSize: 9 },
  driverApprovalRow: { marginTop: 13, marginBottom: 6, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 7, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  driverAccountMenuItem: { minHeight: 40, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  driverAccountMenuText: { color: colors.forest, fontSize: 10, fontWeight: "900" },
  driverLogoutText: { color: colors.coral, fontSize: 10, fontWeight: "900" },
  driverTabs: { minHeight: 64, paddingHorizontal: 10, flexDirection: "row", alignItems: "stretch", backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.border },
  driverTab: { flex: 1, minHeight: 58, alignItems: "center", justifyContent: "center", gap: 3, borderBottomWidth: 3, borderBottomColor: "transparent" },
  driverTabActive: { borderBottomColor: colors.coral },
  driverTabIcon: { color: colors.sage, fontSize: 15, fontWeight: "900" },
  driverTabText: { color: colors.sage, fontSize: 8, fontWeight: "900" },
  driverTabTextActive: { color: colors.forest },
  driverContent: { padding: 20, paddingBottom: 50 },
  driverDemoBanner: { alignSelf: "flex-start", marginBottom: 16, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, backgroundColor: "#FFF0D4" },
  driverDemoBannerText: { color: "#8A5A12", fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  driverPageTitle: { color: colors.forest, fontSize: 28, lineHeight: 34, fontWeight: "900", letterSpacing: -0.7, marginTop: 5, marginBottom: 9 },
  driverFeedHeading: { marginTop: 24, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  driverSearchShortcut: { minHeight: 39, paddingHorizontal: 18, borderRadius: 8, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" },
  driverSearchShortcutText: { color: colors.white, fontSize: 9, fontWeight: "900" },
  previewLabel: { color: colors.coral, fontSize: 8, lineHeight: 12, fontWeight: "900", letterSpacing: 0.8, marginVertical: 10 },
  driverRouteCard: { marginBottom: 13, padding: 17, borderRadius: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  driverRouteTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 },
  driverRouteTiming: { color: colors.coral, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.7 },
  driverRouteDrive: { color: colors.sage, fontSize: 9, fontWeight: "800" },
  driverRouteName: { color: colors.forest, fontSize: 16, fontWeight: "900" },
  driverRouteLine: { width: 2, height: 16, marginLeft: 7, marginVertical: 3, backgroundColor: colors.border },
  driverRouteFacts: { marginTop: 13, flexDirection: "row", flexWrap: "wrap", gap: 7 },
  driverRouteFact: { color: colors.forestSoft, fontSize: 8, fontWeight: "800", paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.mint },
  driverRouteReason: { color: colors.sage, fontSize: 9, lineHeight: 14, marginTop: 12 },
  driverReserveButton: { minHeight: 41, marginTop: 14, borderRadius: 8, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" },
  driverReserveButtonText: { color: colors.white, fontSize: 9, fontWeight: "900" },
  driverSearchCard: { marginTop: 18, padding: 17, borderRadius: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  savedRequestList: { marginTop: 20, gap: 10 },
  savedRequestCard: { padding: 16, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  liveOfferCard: { borderColor: colors.yellow, borderWidth: 2 },
  offerActions: { marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 14 },
  routeDirectionActions: { marginTop: 15, gap: 9 },
  primaryDirectionButton: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.forest },
  secondaryDirectionButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.forest, backgroundColor: colors.paper },
  secondaryDirectionText: { color: colors.forest, fontSize: 9, fontWeight: "900" },
  offerDeclineText: { color: colors.coral, fontSize: 9, fontWeight: "900" },
  driverNotificationCard: { marginTop: 12, padding: 17, borderRadius: 12, backgroundColor: "#FFF5D8", borderWidth: 1, borderColor: "#E7CA77" },
  nativeNotificationButton: { alignSelf: "flex-start", marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.forest },
  nativeAcknowledged: { marginTop: 10, color: colors.forestSoft, fontSize: 9, fontWeight: "900" },
  nativePickupConfirmation: { marginBottom: 14, padding: 18, borderRadius: 13, backgroundColor: "#FFF5D8", borderWidth: 1, borderColor: "#E7CA77" },
  nativePickupConfirmed: { backgroundColor: "#E8F4EA", borderColor: "#9FC7A8" },
  nativePickupUnavailable: { backgroundColor: colors.paper, borderColor: colors.border },
  nativePickupActions: { marginTop: 13, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 },
  nativeConfirmPickup: { paddingHorizontal: 15, paddingVertical: 11, borderRadius: 8, backgroundColor: colors.forest },
  driverSearchTimeRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  locationPreferenceButton: { minHeight: 42, marginBottom: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.forest, alignItems: "center", justifyContent: "center" },
  locationPreferenceText: { color: colors.forest, fontSize: 9, fontWeight: "900" },
  previewResults: { marginTop: 18 },
  driverEmptyCard: { minHeight: 210, marginTop: 18, padding: 22, borderRadius: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, alignItems: "flex-start", justifyContent: "center" },
  driverProfileCard: { marginTop: 15, marginBottom: 20, padding: 17, borderRadius: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  privateProfileNote: { color: colors.sage, fontSize: 9, lineHeight: 14, marginBottom: 12 },
  connectedCard: { marginTop: 12, padding: 20, borderRadius: 14, backgroundColor: colors.mint, borderWidth: 1, borderColor: colors.border },
  connectedTitle: { color: colors.forest, fontWeight: "900", fontSize: 17, marginBottom: 8 },
  connectedBody: { color: colors.forestSoft, marginTop: 4 },
  driverVerificationCard: { marginTop: 14, padding: 20, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  driverVerificationHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  verificationStatusDot: { width: 12, height: 12, marginTop: 5, borderRadius: 6, backgroundColor: colors.yellow },
  verificationStatusDotVerified: { backgroundColor: "#56C78A" },
  errorText: { color: "#A34436", fontWeight: "700", marginBottom: 10 },
  welcomeScroll: { flexGrow: 1, paddingTop: 14 },
  brandRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 24, gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 19, borderBottomLeftRadius: 6, backgroundColor: colors.coral, alignItems: "center", justifyContent: "center" },
  brandLetter: { color: colors.white, fontSize: 19, fontWeight: "900" },
  brandNameLight: { color: colors.white, fontSize: 20, fontWeight: "800", letterSpacing: -0.6 },
  nativePill: { marginLeft: "auto", borderWidth: 1, borderColor: colors.forestSoft, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  nativePillText: { color: "#A9C2B5", fontSize: 8, letterSpacing: 1.2, fontWeight: "800" },
  hero: { paddingHorizontal: 25, paddingTop: 54, paddingBottom: 45 },
  eyebrowLight: { color: colors.yellow, fontSize: 10, letterSpacing: 1.8, fontWeight: "900", marginBottom: 14 },
  heroTitle: { color: colors.white, fontSize: 42, lineHeight: 46, letterSpacing: -1.4, fontWeight: "700" },
  heroBody: { color: "#B7CBC0", fontSize: 15, lineHeight: 23, marginTop: 18, maxWidth: 350 },
  roleSheet: { backgroundColor: colors.cream, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 28, paddingBottom: 28, flexGrow: 1 },
  sheetEyebrow: { color: colors.coral, fontSize: 9, letterSpacing: 1.6, fontWeight: "900" },
  sheetTitle: { color: colors.forest, fontSize: 27, fontWeight: "700", marginTop: 6, marginBottom: 18, letterSpacing: -0.7 },
  roleCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  roleCardPressed: { transform: [{ scale: 0.985 }], backgroundColor: colors.mint },
  roleIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: colors.yellow, alignItems: "center", justifyContent: "center" },
  driverIcon: { backgroundColor: colors.coral },
  pantryIcon: { backgroundColor: colors.mint },
  roleIconText: { fontSize: 22, color: colors.white, fontWeight: "900" },
  roleText: { flex: 1, marginLeft: 13 },
  roleTitle: { color: colors.forest, fontSize: 15, fontWeight: "800" },
  roleDescription: { color: colors.sage, fontSize: 11, lineHeight: 16, marginTop: 4, paddingRight: 4 },
  chevron: { color: colors.forestSoft, fontSize: 28, fontWeight: "300" },
  securityNote: { color: colors.sage, textAlign: "center", fontSize: 9, lineHeight: 14, marginHorizontal: 20, marginTop: 8 },
  authSafe: { flex: 1, backgroundColor: colors.cream },
  authHeader: { height: 68, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  backArrow: { color: colors.forest, fontSize: 31, lineHeight: 32, marginTop: -3 },
  authBrand: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  smallMark: { width: 26, height: 26, borderRadius: 13, borderBottomLeftRadius: 5, backgroundColor: colors.coral, alignItems: "center", justifyContent: "center" },
  smallMarkText: { color: colors.white, fontWeight: "900", fontSize: 13 },
  authBrandText: { color: colors.forest, fontSize: 16, fontWeight: "800" },
  headerSpacer: { width: 40 },
  authScroll: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 48 },
  roleBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.mint, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18, marginBottom: 18 },
  roleBadgeText: { color: colors.forest, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1 },
  authEyebrow: { color: colors.coral, fontSize: 9, letterSpacing: 1.7, fontWeight: "900", marginBottom: 8 },
  authTitle: { color: colors.forest, fontSize: 34, lineHeight: 39, letterSpacing: -1, fontWeight: "700" },
  authBody: { color: colors.sage, fontSize: 13, lineHeight: 20, marginTop: 10, marginBottom: 24 },
  primaryButton: { minHeight: 54, backgroundColor: colors.coral, borderRadius: 10, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", marginTop: 10 },
  darkButton: { backgroundColor: colors.forest },
  disabledButton: { opacity: 0.42 },
  buttonPressed: { transform: [{ scale: 0.985 }] },
  primaryButtonText: { color: colors.white, fontSize: 13, fontWeight: "900", flex: 1 },
  darkButtonText: { color: colors.white },
  buttonArrow: { color: colors.white, fontSize: 20 },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 25 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.sage, fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  field: { marginBottom: 15 },
  fieldLabel: { color: colors.forestSoft, fontSize: 9, letterSpacing: 0.8, fontWeight: "900", textTransform: "uppercase", marginBottom: 7 },
  input: { minHeight: 52, borderWidth: 1, borderColor: "#C8D3CB", borderRadius: 9, backgroundColor: colors.paper, color: colors.forest, paddingHorizontal: 14, fontSize: 14 },
  multiline: { minHeight: 100, paddingTop: 14, textAlignVertical: "top" },
  linkText: { textAlign: "center", color: colors.forestSoft, fontSize: 11, fontWeight: "800", marginTop: 17 },
  consentRow: { flexDirection: "row", gap: 11, alignItems: "flex-start", marginVertical: 9 },
  checkbox: { width: 23, height: 23, borderRadius: 6, borderWidth: 1, borderColor: "#AFC0B5", backgroundColor: colors.paper, alignItems: "center", justifyContent: "center" },
  checkboxSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  checkmark: { color: colors.white, fontWeight: "900" },
  consentText: { color: colors.sage, flex: 1, fontSize: 10, lineHeight: 16 },
  verificationPreview: { marginVertical: 10, padding: 15, borderRadius: 10, backgroundColor: colors.mint, borderWidth: 1, borderColor: colors.border },
  verificationPreviewTitle: { color: colors.forest, fontSize: 12, fontWeight: "900" },
  verificationPreviewBody: { color: colors.sage, fontSize: 9, lineHeight: 14, marginTop: 5 },
  partnerHelp: { marginTop: 24, padding: 18, backgroundColor: colors.mint, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: colors.yellow },
  partnerHelpTitle: { color: colors.forest, fontSize: 14, fontWeight: "800" },
  partnerHelpBody: { color: colors.sage, fontSize: 10, lineHeight: 16, marginTop: 6 },
  partnerHelpLink: { color: colors.coral, fontSize: 11, fontWeight: "900", marginTop: 12 },
  pending: { alignItems: "center", paddingTop: 40 },
  pendingIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  pendingIconText: { color: colors.forest, fontSize: 30, fontWeight: "900" },
  centerText: { textAlign: "center" },
});
