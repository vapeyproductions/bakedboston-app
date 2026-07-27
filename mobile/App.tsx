import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
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
type Session = { role: Role; accountId: number; displayName: string; email: string };
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://www.baked-boston.com";
const TOKEN_KEY = "bakedboston.mobileToken";

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
        setSession(data.session);
        setRole(data.session.role); setScreen("workspace");
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
    setScreen(nextRole === "driver" ? "driver-access" : "partner-login");
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
  const [form, setForm] = useState({ displayName: "", email: "", phone: "", homeZip: "", password: "" }); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function register() { setBusy(true); setError(""); try { const { response, data } = await postAuth({ action: "register-driver", role: "driver", ...form }); if (response.ok) await onAuthenticated(data); else setError(data.error ?? "Could not create driver account."); } catch { setError("The registration request timed out. Check your connection and try again."); } finally { setBusy(false); } }
  return <>
    <Text style={styles.authEyebrow}>NEW DRIVER</Text>
    <Text style={styles.authTitle}>Create your profile.</Text>
    <Text style={styles.authBody}>You’ll use this account to reserve routes, confirm pickups, and record completed deliveries.</Text>
    <Field label="Full name" value={form.displayName} onChangeText={(displayName) => setForm({ ...form, displayName })} placeholder="Your name" />
    <Field label="Email address" value={form.email} onChangeText={(email) => setForm({ ...form, email })} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
    <Field label="Mobile number" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} placeholder="(617) 555-0123" keyboardType="phone-pad" />
    <Field label="Home ZIP code" value={form.homeZip} onChangeText={(homeZip) => setForm({ ...form, homeZip })} placeholder="02118" keyboardType="number-pad" />
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
  const copy = roleCopy[session.role];
  return <SafeAreaView style={styles.workspaceSafe} edges={["top", "bottom"]}>
    <View style={styles.workspaceHeader}><View style={styles.smallMark}><Text style={styles.smallMarkText}>B</Text></View><Text style={styles.workspaceBrand}>BakedBoston</Text><Pressable onPress={onSignOut}><Text style={styles.workspaceSignOut}>Sign out</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.workspaceContent}>
      <View style={styles.roleBadge}><Text>{copy.icon}</Text><Text style={styles.roleBadgeText}>{session.role}</Text></View>
      <Text style={styles.authEyebrow}>SIGNED IN SECURELY</Text>
      <Text style={styles.authTitle}>Welcome, {session.displayName || "partner"}.</Text>
      <Text style={styles.authBody}>{session.role === "driver" ? "Your driver account is ready. Route discovery and reservations are the next app milestone." : `Your ${session.role} account is connected to BakedBoston. The native availability and activity workspace comes next.`}</Text>
      <View style={styles.connectedCard}><Text style={styles.connectedTitle}>Account connected</Text><Text style={styles.connectedBody}>{session.email}</Text><Text style={styles.connectedBody}>Role: {session.role}</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

type PartnerSection = "overview" | "activity" | "schedule" | "profile";

function PartnerPortal({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const landscape = width > height;
  const bakery = session.role === "bakery";
  const [section, setSection] = useState<PartnerSection>("overview");
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => undefined);
  }, []);
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
                <Text style={styles.portalOrganizationName} numberOfLines={2}>{session.displayName}</Text>
              </View>
            </View>
            <View style={styles.portalSideNav}>
              {nav.map((item) => <PortalNavButton key={item.key} item={item} selected={section === item.key} onPress={() => setSection(item.key)} compact={false} />)}
            </View>
            <View style={styles.portalSideBottom}>
              <Text style={styles.portalAccountEmail} numberOfLines={1}>{session.email}</Text>
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
            <View style={styles.portalAvatar}><Text style={styles.portalAvatarText}>{initials(session.displayName)}</Text></View>
          </View>
          <PartnerSectionContent section={section} bakery={bakery} landscape={landscape} rightInset={landscape ? insets.right : 0} />
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

function PartnerSectionContent({ section, bakery, landscape, rightInset }: { section: PartnerSection; bakery: boolean; landscape: boolean; rightInset: number }) {
  if (section === "overview") {
    return <ScrollView contentContainerStyle={[styles.portalContent, landscape && { paddingRight: 28 + rightInset }, !landscape && styles.portalContentMobile]} showsVerticalScrollIndicator={false}>
      <View style={[styles.portalStatusCard, !landscape && styles.portalStatusCardMobile]}>
        <View style={styles.portalStatusCopy}>
          <View style={styles.portalStatusLabel}><View style={styles.portalStatusDot} /><Text style={styles.portalStatusLabelText}>WORKSPACE CONNECTED</Text></View>
          <Text style={styles.portalStatusTitle}>{bakery ? "Manage today’s pickup availability." : "Manage today’s delivery availability."}</Text>
          <Text style={styles.portalStatusBody}>Live schedule controls and one-time availability will appear here, matching the web portal.</Text>
        </View>
        <Pressable style={styles.portalStatusButton}><Text style={styles.portalStatusButtonText}>{bakery ? "View pickup schedule" : "View receiving schedule"}</Text></Pressable>
      </View>
      <View style={[styles.portalMetrics, !landscape && styles.portalMetricsMobile]}>
        <MetricCard value="—" label="Next arrival" />
        <MetricCard value="0" label="Deliveries this month" />
        <MetricCard value="0" label="Completed orders" />
      </View>
      <View style={styles.portalPanel}>
        <View style={styles.portalPanelHeading}><View><Text style={styles.portalPanelKicker}>RECENT ACTIVITY</Text><Text style={styles.portalPanelTitle}>Delivery updates</Text></View><Text style={styles.portalPanelLink}>View all</Text></View>
        <View style={styles.portalEmpty}><Text style={styles.portalEmptyTitle}>No deliveries yet</Text><Text style={styles.portalEmptyBody}>Reserved, ongoing, and completed deliveries will appear here automatically.</Text></View>
      </View>
    </ScrollView>;
  }
  if (section === "activity") return <PrototypePage rightInset={rightInset} kicker="DELIVERY HISTORY" title={bakery ? "Your pickups" : "Your deliveries"} body="Reserved, ongoing, and completed deliveries will appear here automatically." button="No deliveries yet" />;
  if (section === "schedule") return <PrototypePage rightInset={rightInset} kicker="NEXT FOUR WEEKS" title={bakery ? "Pickup calendar" : "Receiving calendar"} body="Recurring and one-time availability will use the same four-week calendar as the web portal." button={bakery ? "+ Add pickup window" : "+ Add availability window"} />;
  return <PrototypePage rightInset={rightInset} kicker="ORGANIZATION SETTINGS" title="Profile and contacts" body="Account email, organization channels, access instructions, photos, and organizational contacts will be editable here." button="Edit profile" />;
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return <View style={styles.portalMetricCard}><Text style={styles.portalMetricValue}>{value}</Text><Text style={styles.portalMetricLabel}>{label}</Text></View>;
}

function PrototypePage({ kicker, title, body, button, rightInset }: { kicker: string; title: string; body: string; button: string; rightInset: number }) {
  return <ScrollView contentContainerStyle={[styles.portalContent, { paddingRight: 28 + rightInset }]}>
    <View style={styles.portalPanel}>
      <Text style={styles.portalPanelKicker}>{kicker}</Text>
      <Text style={styles.portalFeatureTitle}>{title}</Text>
      <Text style={styles.portalFeatureBody}>{body}</Text>
      <Pressable style={styles.portalFeatureButton}><Text style={styles.portalFeatureButtonText}>{button}</Text></Pressable>
    </View>
  </ScrollView>;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "BB";
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
  portalFeatureTitle: { color: colors.forest, fontSize: 27, fontWeight: "800", marginTop: 8 },
  portalFeatureBody: { color: colors.sage, fontSize: 12, lineHeight: 19, marginTop: 10, maxWidth: 560 },
  portalFeatureButton: { alignSelf: "flex-start", minHeight: 44, paddingHorizontal: 18, borderRadius: 8, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center", marginTop: 25 },
  portalFeatureButtonText: { color: colors.white, fontSize: 10, fontWeight: "900" },
  welcomeSafe: { flex: 1, backgroundColor: colors.forest },
  workspaceSafe: { flex: 1, backgroundColor: colors.cream },
  workspaceHeader: { minHeight: 64, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.paper },
  workspaceBrand: { flex: 1, color: colors.forest, fontWeight: "900", fontSize: 18 },
  workspaceSignOut: { color: colors.coral, fontWeight: "800" },
  workspaceContent: { padding: 26, gap: 12 },
  connectedCard: { marginTop: 12, padding: 20, borderRadius: 14, backgroundColor: colors.mint, borderWidth: 1, borderColor: colors.border },
  connectedTitle: { color: colors.forest, fontWeight: "900", fontSize: 17, marginBottom: 8 },
  connectedBody: { color: colors.forestSoft, marginTop: 4 },
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
  partnerHelp: { marginTop: 24, padding: 18, backgroundColor: colors.mint, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: colors.yellow },
  partnerHelpTitle: { color: colors.forest, fontSize: 14, fontWeight: "800" },
  partnerHelpBody: { color: colors.sage, fontSize: 10, lineHeight: 16, marginTop: 6 },
  partnerHelpLink: { color: colors.coral, fontSize: 11, fontWeight: "900", marginTop: 12 },
  pending: { alignItems: "center", paddingTop: 40 },
  pendingIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  pendingIconText: { color: colors.forest, fontSize: 30, fontWeight: "900" },
  centerText: { textAlign: "center" },
});
