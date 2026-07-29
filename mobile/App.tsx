import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import * as ScreenOrientation from "expo-screen-orientation";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
type Screen = "welcome" | "learn" | "driver-access" | "driver-register" | "partner-login" | "partner-request" | "pending" | "workspace";
type Session = { role: Role; accountId: number; displayName: string; email: string; verificationStatus?: "not_started" | "pending" | "verified" | "needs_attention" };
type MobileRoute = { id: number; bakeryName: string; pantryName: string; driverName: string; scheduledArrival: string; status: "reserved" | "ongoing" | "completed" | "cancelled"; deliveryProofUrl: string; createdAt: string };
type DriverProfile = { id: number; email: string; displayName: string; phone: string; homeAddress: string; homeZip: string; dateOfBirth: string; verificationStatus: "not_started" | "pending" | "verified" | "needs_attention" };
type IdentityVerificationResponse = { status: DriverProfile["verificationStatus"]; method: "stripe"; url?: string | null; message?: string };
type DriverRideRequest = { id: number; serviceDate: string; earliestStart: string; latestFinish: string; startZip: string; endZip: string; maximumExtraMinutes: number | null; status: "active" | "paused" | "matched" | "expired" | "cancelled" };
type DriverDestination = { name: string; address: string; dropoffInstructions: string; photos: Array<{ id: number; imageUrl: string; caption: string }> };
type DriverRouteOffer = {
  id: number; pickupOccurrenceId: number; status: "queued" | "offered" | "accepted" | "declined" | "expired" | "withdrawn" | "cancelled";
  deliveryStage: "reserved" | "en_route_to_bakery" | "arrived_at_bakery" | "picked_up" | "en_route_to_pantry" | "arrived_at_pantry" | "completed";
  expiresAt: string | null; estimatedBakeryArrival: string; estimatedPantryArrival: string;
  departureWindowStartsAt: string | null; departureWindowEndsAt: string | null;
  driverConfirmationDueAt: string | null; driverConfirmationDeadlineAt: string | null;
  driverConfirmationRequestedAt: string | null; driverConfirmedAt: string | null;
  pickupReadyAt: string | null;
  pantryServiceMode: "staffed" | "unattended";
  deliveryProofUrl: string;
  pickup: PickupOccurrence | null;
  bakery: DriverDestination | null; pantry: DriverDestination | null;
};
type DriverNotification = { id: number; eventType: string; threadKey: string; title: string; body: string; actionRequired: boolean; actionKey: string; acknowledgedAt: string | null; createdAt: string };
type BrowseRoute = {
  id: string; pickupId: number; pantryId: number; bakeryName: string; pantryName: string;
  departureWindowStartsAt: string; departureWindowEndsAt: string;
  estimatedBakeryArrival: string; estimatedPantryArrival: string;
  distanceToBakeryMiles: number; routeMiles: number;
};
type MobileContact = { id: number; name: string; email: string; phone: string; isPrimary: boolean };
type MobileWindow = { id: number; startsAt: string; endsAt: string; latestArrival: string; serviceMode: "staffed" | "unattended"; paused: boolean };
type WorkspaceData = {
  account: { accountEmail: string; administratorName: string; contactEmail: string; contactPhone: string };
  organization: {
    id: number; name: string; address: string; businessPhone: string; notificationPhone: string; dropoffInstructions: string;
    recurringDays: string; businessOpenTime?: string; businessCloseTime?: string; readyTime?: string; arrivalDeadline?: string; openTime?: string; closeTime?: string; latestArrival?: string; serviceModes?: string;
  };
  contacts: MobileContact[];
  availabilityWindows: MobileWindow[];
  availabilityPauses: Array<{ id: number; endsAt: string }>;
  scheduleExceptions: Array<{ id: number; exceptionDate: string }>;
  routes: MobileRoute[];
  photos: Array<{ id: number; imageUrl: string; caption: string }>;
  impactPhotos: Array<{ id: number; rescueRouteId: number; imageUrl: string; caption: string; socialConsent: boolean; createdAt: string }>;
  pickupOccurrences: PickupOccurrence[];
  notifications: DriverNotification[];
  nextArrival: string | null;
};
type PickupOccurrence = { id: number; serviceDate: string; pickupWindowStartsAt: string; pickupDeadline: string; status: "scheduled" | "awaiting_confirmation" | "confirmed" | "decision_deferred" | "insufficient_food" | "reserved" | "fulfilled" | "cancelled"; confirmedAt: string | null };
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://www.baked-boston.com";
const TOKEN_KEY = "bakedboston.mobileToken";
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

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
  driver: { icon: "↗", title: "I’m a driver", description: "Discover, reserve, and complete community delivery routes." },
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
        const restoredSession = data.session;
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
      <StatusBar style={screen === "welcome" || screen === "learn" ? "light" : "dark"} />
      {screen === "welcome" ? (
        <WelcomeScreen onChoose={chooseRole} onLearn={() => setScreen("learn")} />
      ) : screen === "learn" ? (
        <LearnScreen
          onBack={() => setScreen("welcome")}
          onCreateDriver={() => {
            setRole("driver");
            setScreen("driver-register");
          }}
        />
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

function WelcomeScreen({ onChoose, onLearn }: { onChoose: (role: Role) => void; onLearn: () => void }) {
  return (
    <SafeAreaView style={styles.welcomeSafe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.welcomeScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandLetter}>B</Text></View>
          <Text style={styles.brandNameLight}>BakedBoston</Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Good food should{"\n"}go somewhere good.</Text>
          <Text style={styles.heroBody}>Join Boston’s community-powered network connecting bakery surplus with neighborhood food pantries.</Text>
          <Pressable accessibilityRole="button" onPress={onLearn} style={styles.learnButton}>
            <Text style={styles.learnButtonText}>See how BakedBoston works</Text>
            <Text style={styles.learnButtonArrow}>›</Text>
          </Pressable>
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

const learnSlides = [
  {
    icon: "🥖",
    kicker: "THE OPPORTUNITY",
    stat: "17%",
    title: "Good bakery food gets left behind.",
    body: "A 2025 bakery-industry article reported that about 17% of bakery products were discarded before reaching customers.",
  },
  {
    icon: "🥫",
    kicker: "THE NEED",
    stat: "40%",
    title: "Local pantries are under growing pressure.",
    body: "Food insecurity reached a record 40% of Massachusetts households in 2025. Pantries remain a critical local safety net.",
  },
  {
    icon: "↗",
    kicker: "THE CONNECTION",
    title: "A short drive closes the gap.",
    body: "BakedBoston connects an available bakery pickup with a nearby pantry and a community driver.",
  },
] as const;

function LearnScreen({ onBack, onCreateDriver }: { onBack: () => void; onCreateDriver: () => void }) {
  const [step, setStep] = useState(0);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const isProcess = step === learnSlides.length;
  const slide = isProcess ? null : learnSlides[step];

  return (
    <SafeAreaView style={styles.learnSafe} edges={["top", "bottom"]}>
      <View style={styles.learnHeader}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.learnHeaderBack}>
          <Text style={styles.learnHeaderBackText}>‹</Text>
        </Pressable>
        <View style={styles.learnBrand}>
          <View style={styles.smallMark}><Text style={styles.smallMarkText}>B</Text></View>
          <Text style={styles.learnBrandText}>BakedBoston</Text>
        </View>
        <View style={styles.learnHeaderSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.learnScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.learnCard}>
          {slide ? (
            <>
              <View style={styles.learnIconBubble}><Text style={styles.learnIcon}>{slide.icon}</Text></View>
              <Text style={styles.learnKicker}>{slide.kicker}</Text>
              {"stat" in slide && <Text style={styles.learnStat}>{slide.stat}</Text>}
              <Text style={styles.learnTitle}>{slide.title}</Text>
              <Text style={styles.learnBody}>{slide.body}</Text>
            </>
          ) : (
            <>
              <Text style={styles.learnKicker}>HOW IT WORKS</Text>
              <Text style={styles.learnTitle}>Choose a route. Make the delivery.</Text>
              <View style={styles.learnProcess}>
                {[
                  ["1", "Choose", "Pick a nearby route now or search for one that fits a future trip."],
                  ["2", "Pick up", "Drive to the bakery and collect the available food."],
                  ["3", "Drop off", "Bring it to the pantry. That’s it."],
                ].map(([number, title, body]) => (
                  <View key={number} style={styles.learnProcessRow}>
                    <View style={styles.learnNumber}><Text style={styles.learnNumberText}>{number}</Text></View>
                    <View style={styles.learnProcessCopy}>
                      <Text style={styles.learnProcessTitle}>{title}</Text>
                      <Text style={styles.learnProcessBody}>{body}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        <View style={styles.learnDots}>
          {[0, 1, 2, 3].map((index) => (
            <View key={index} style={[styles.learnDot, index === step && styles.learnDotActive]} />
          ))}
        </View>

        {isProcess ? (
          <>
            <Pressable accessibilityRole="button" onPress={onCreateDriver} style={styles.learnPrimaryButton}>
              <Text style={styles.learnPrimaryButtonText}>Create a driver account</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onBack} style={styles.learnSecondaryButton}>
              <Text style={styles.learnSecondaryButtonText}>Back</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setSourcesOpen(true)}>
              <Text style={styles.learnSourceLink}>About the data</Text>
            </Pressable>
          </>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setStep((current) => current + 1)} style={styles.learnPrimaryButton}>
            <Text style={styles.learnPrimaryButtonText}>Next</Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal visible={sourcesOpen} transparent animationType="fade" onRequestClose={() => setSourcesOpen(false)}>
        <View style={styles.sourceModalBackdrop}>
          <View style={styles.sourceModalCard}>
            <View style={styles.sourceModalHeader}>
              <View>
                <Text style={styles.learnKicker}>ABOUT THE DATA</Text>
                <Text style={styles.sourceModalTitle}>Sources and context</Text>
              </View>
              <Pressable accessibilityLabel="Close data sources" accessibilityRole="button" onPress={() => setSourcesOpen(false)} style={styles.sourceModalClose}>
                <Text style={styles.sourceModalCloseText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.sourceItem}>
              <Text style={styles.sourceYear}>2025 · BAKERY WASTE</Text>
              <Text style={styles.sourceStat}>17%</Text>
              <Text style={styles.sourceBody}>A bakery-industry article cites a German study finding that about 17% of products baked in bakeries are discarded before reaching customers.</Text>
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL("https://magazinebbm.com/blog/food-waste-and-the-problem-of-bakery-product-loss-4003")}>
                <Text style={styles.sourceArticleLink}>Read the BBM Magazine article ↗</Text>
              </Pressable>
            </View>

            <View style={styles.sourceItem}>
              <Text style={styles.sourceYear}>2025 · FOOD INSECURITY</Text>
              <Text style={styles.sourceStat}>40%</Text>
              <Text style={styles.sourceBody}>The Greater Boston Food Bank and Mass General Brigham reported that food insecurity reached a record 40% of Massachusetts households in 2025.</Text>
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL("https://www.massgeneralbrigham.org/en/about/newsroom/press-releases/2026-greater-boston-food-bank-annual-food-access-report")}>
                <Text style={styles.sourceArticleLink}>Read the statewide report ↗</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    <Text style={styles.authTitle}>Ready to drive?</Text>
    <Text style={styles.authBody}>Create a volunteer profile to discover routes near you, or sign in to continue with your existing account.</Text>
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
  </>;
}

function BirthDateField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const maximumDate = new Date();
  maximumDate.setFullYear(maximumDate.getFullYear() - 18);
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : maximumDate;
  const displayValue = value
    ? selectedDate.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })
    : "Select your birthday";

  function selectDate(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === "android") setOpen(false);
    if (event.type !== "set" || !date) return;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    onChange(`${year}-${month}-${day}`);
  }

  return <View style={styles.birthDateGroup}>
    <Text style={styles.fieldLabel}>DATE OF BIRTH</Text>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Date of birth, ${displayValue}`}
      style={styles.birthDateButton}
      onPress={() => setOpen(true)}
    >
      <Text style={[styles.birthDateValue, !value && styles.birthDatePlaceholder]}>{displayValue}</Text>
      <Text style={styles.birthDateIcon}>▣</Text>
    </Pressable>
    <Text style={styles.birthDateHelp}>Drivers must be at least 18 years old.</Text>
    {open && Platform.OS === "android" && <DateTimePicker value={selectedDate} mode="date" maximumDate={maximumDate} minimumDate={new Date(1900, 0, 1)} onChange={selectDate} />}
    {open && Platform.OS === "ios" && <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.datePickerBackdrop}>
        <View style={styles.datePickerCard}>
          <Text style={styles.authEyebrow}>DATE OF BIRTH</Text>
          <Text style={styles.datePickerTitle}>Choose your birthday</Text>
          <DateTimePicker value={selectedDate} mode="date" display="spinner" maximumDate={maximumDate} minimumDate={new Date(1900, 0, 1)} onChange={selectDate} />
          <Pressable style={styles.datePickerDone} onPress={() => setOpen(false)}><Text style={styles.driverReserveButtonText}>Done</Text></Pressable>
        </View>
      </View>
    </Modal>}
  </View>;
}

function DriverRegistration({ onAuthenticated }: { onAuthenticated: (data: { token: string; session: Session }) => Promise<void> }) {
  const [agreed, setAgreed] = useState(false);
  const [form, setForm] = useState({ displayName: "", email: "", phone: "", homeAddress: "", homeZip: "", dateOfBirth: "", password: "" }); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function register() { setBusy(true); setError(""); try { const { response, data } = await postAuth({ action: "register-driver", role: "driver", acceptedTerms: agreed, ...form }); if (response.ok) await onAuthenticated(data); else setError(data.error ?? "Could not create driver account."); } catch { setError("The registration request timed out. Check your connection and try again."); } finally { setBusy(false); } }
  return <>
    <Text style={styles.authEyebrow}>NEW DRIVER</Text>
    <Text style={styles.authTitle}>Create your profile.</Text>
    <Text style={styles.authBody}>You’ll use this account to reserve routes, confirm pickups, and record completed deliveries.</Text>
    <Field label="Legal name" value={form.displayName} onChangeText={(displayName) => setForm({ ...form, displayName })} placeholder="Name shown on your ID" textContentType="name" />
    <Field label="Email address" value={form.email} onChangeText={(email) => setForm({ ...form, email })} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
    <Field label="Mobile number" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} placeholder="(617) 555-0123" keyboardType="phone-pad" />
    <Field label="Home address" value={form.homeAddress} onChangeText={(homeAddress) => setForm({ ...form, homeAddress })} placeholder="Street, city, state" textContentType="fullStreetAddress" />
    <Field label="Home ZIP code" value={form.homeZip} onChangeText={(homeZip) => setForm({ ...form, homeZip })} placeholder="02118" keyboardType="number-pad" />
    <BirthDateField value={form.dateOfBirth} onChange={(dateOfBirth) => setForm({ ...form, dateOfBirth })} />
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
      <Text style={styles.consentText}>I am at least 18 years old and agree to follow food-safety instructions and accurately confirm pickups and deliveries.</Text>
    </Pressable>
    <View style={styles.legalLinks}><Pressable onPress={() => Linking.openURL("https://www.baked-boston.com/terms")}><Text style={styles.linkText}>Terms of Use</Text></Pressable><Pressable onPress={() => Linking.openURL("https://www.baked-boston.com/privacy")}><Text style={styles.linkText}>Privacy Policy</Text></Pressable></View>
    <View style={styles.verificationPreview}><Text style={styles.verificationPreviewTitle}>Driver review required</Text><Text style={styles.verificationPreviewBody}>After you create your profile, BakedBoston will review your driver information before you can reserve a delivery. Your account will show as pending until that review is complete.</Text></View>
    {error ? <Text style={styles.errorText}>{error}</Text> : null}
    <PrimaryButton label={busy ? "Creating profile…" : "Create driver profile"} disabled={!agreed || busy || !form.dateOfBirth || !form.displayName || !form.email || !form.password} onPress={register} />
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

type DriverSection = "home" | "search" | "routes" | "impact" | "profile" | "report";

function DriverPortal({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [section, setSection] = useState<DriverSection>("home");
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [error, setError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [search, setSearch] = useState({ date: localDateString(new Date()), earliest: "17:00", latest: "19:00", startZip: "", endZip: "" });
  const [searched, setSearched] = useState(false);
  const [rideRequests, setRideRequests] = useState<DriverRideRequest[]>([]);
  const [routeOffers, setRouteOffers] = useState<DriverRouteOffer[]>([]);
  const [driverNotifications, setDriverNotifications] = useState<DriverNotification[]>([]);
  const [browseRoutes, setBrowseRoutes] = useState<BrowseRoute[]>([]);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    let timer: ReturnType<typeof setInterval> | undefined;
    void registerForPushNotifications().catch(() => undefined);
    loadDriverProfile().then(setProfile).catch(() => setError("Could not load the driver profile."));
    const refreshMatching = async () => {
      const coordinates = await currentDriverCoordinates();
      return loadDriverMatching(coordinates).then((data) => {
        setRideRequests(data.requests);
        setRouteOffers(data.offers);
        setDriverNotifications(data.notifications);
        setBrowseRoutes(data.browseRoutes);
      });
    };
    const safeRefreshMatching = () => refreshMatching().catch(() => setError("Could not load saved ride requests."));
    void safeRefreshMatching();
    timer = setInterval(safeRefreshMatching, 20_000);
    return () => { if (timer) clearInterval(timer); };
  }, []);
  async function saveRideRequest() {
    setError("");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(search.date) || search.earliest >= search.latest) {
      setError("Choose a valid date and a latest finish after the earliest start.");
      return;
    }
    const requestedStart = new Date(mobileLocalDateTime(search.date, search.earliest));
    if (requestedStart.getTime() <= Date.now()) {
      setError("You can’t request a ride in the past. Choose a future date and starting time.");
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
  async function reserveBrowseRoute(route: BrowseRoute) {
    try {
      await updateDriverMatching({ action: "reserve-browse-route", pickupId: route.pickupId, pantryId: route.pantryId });
      const data = await loadDriverMatching();
      setRideRequests(data.requests); setRouteOffers(data.offers); setDriverNotifications(data.notifications); setBrowseRoutes(data.browseRoutes);
      Alert.alert("Route reserved", "The bakery and pantry have been notified.");
    } catch (reason) {
      Alert.alert("Could not reserve route", reason instanceof Error ? reason.message : "Please try again.");
    }
  }
  async function progressRoute(offer: DriverRouteOffer, stage: DriverRouteOffer["deliveryStage"]) {
    try {
      await updateDriverMatching({ action: "route-progress", offerId: offer.id, stage });
      const data = await loadDriverMatching();
      setRideRequests(data.requests); setRouteOffers(data.offers); setDriverNotifications(data.notifications);
    } catch (reason) {
      Alert.alert("Could not update route", reason instanceof Error ? reason.message : "Please try again.");
    }
  }
  async function completeUnattendedDelivery(offer: DriverRouteOffer) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Camera permission required", "A drop-off photo is required for unattended deliveries.");
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    try {
      const asset = result.assets[0];
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const imageResponse = await fetch(asset.uri);
      const imageBytes = await imageResponse.arrayBuffer();
      const response = await fetch(`${API_URL}/api/mobile/driver/proof`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token ?? ""}`,
          "Content-Type": asset.mimeType ?? "image/jpeg",
          "X-BakedBoston-Upload": "delivery-proof",
          "X-Offer-Id": String(offer.id),
          "X-File-Name": asset.fileName ?? `delivery-${offer.id}.jpg`,
        },
        body: imageBytes,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Could not upload the drop-off photo.");
      await progressRoute({ ...offer, deliveryProofUrl: data.imageUrl }, "completed");
    } catch (reason) {
      Alert.alert("Could not complete delivery", reason instanceof Error ? reason.message : "Please try again.");
    }
  }
  function cancelRoute(offer: DriverRouteOffer) {
    Alert.alert(
      "Cancel this delivery?",
      "The bakery pickup will return to the available pool. Its current pantry assignment will be released and may change when a future driver searches.",
      [
        { text: "Keep delivery", style: "cancel" },
        {
          text: "Cancel delivery",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDriverMatching({ action: "cancel-route", offerId: offer.id });
              const data = await loadDriverMatching();
              setRideRequests(data.requests); setRouteOffers(data.offers); setDriverNotifications(data.notifications);
              Alert.alert("Delivery cancelled", "The pickup has returned to the available pickup pool.");
            } catch (reason) {
              Alert.alert("Could not cancel delivery", reason instanceof Error ? reason.message : "Please try again.");
            }
          },
        },
      ],
    );
  }
  async function confirmReservedRoute(offer: DriverRouteOffer) {
    try {
      await updateDriverMatching({ action: "confirm-route", offerId: offer.id });
      const data = await loadDriverMatching();
      setRideRequests(data.requests); setRouteOffers(data.offers); setDriverNotifications(data.notifications);
      Alert.alert("Delivery confirmed", "Your reservation remains active.");
    } catch (reason) {
      Alert.alert("Could not confirm delivery", reason instanceof Error ? reason.message : "Please try again.");
    }
  }
  async function beginIdentityVerification() {
    setVerificationBusy(true);
    try {
      const result = await driverIdentityRequest("POST");
      setProfile((current) => current ? { ...current, verificationStatus: result.status } : current);
      if (result.url) {
        Alert.alert(
          "Verify securely with Stripe",
          "Stripe will ask for a government-issued photo ID and a matching selfie. BakedBoston does not receive or store the document images.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Continue", onPress: () => Linking.openURL(result.url!).catch(() => Alert.alert("Could not open Stripe", "Please try again.")) },
          ],
        );
      } else {
        Alert.alert("Verification processing", "Stripe is processing your submission. Check again shortly.");
      }
    } catch (reason) {
      Alert.alert("Could not start verification", reason instanceof Error ? reason.message : "Please try again.");
    } finally {
      setVerificationBusy(false);
    }
  }
  async function refreshIdentityVerification() {
    setVerificationBusy(true);
    try {
      const result = await driverIdentityRequest("GET");
      setProfile((current) => current ? { ...current, verificationStatus: result.status } : current);
      Alert.alert(
        result.status === "verified" ? "Identity verified" : result.status === "needs_attention" ? "Verification needs attention" : "Verification still processing",
        result.status === "verified"
          ? "You can now reserve BakedBoston delivery routes."
          : result.status === "needs_attention"
            ? "Stripe needs another attempt or BakedBoston needs to review the result."
            : "Stripe has not finished processing the verification yet.",
      );
    } catch (reason) {
      Alert.alert("Could not check verification", reason instanceof Error ? reason.message : "Please try again.");
    } finally {
      setVerificationBusy(false);
    }
  }
  const verificationStatus = profile?.verificationStatus ?? session.verificationStatus ?? "not_started";
  const verificationLabel = verificationStatus === "verified" ? "Identity verified" : verificationStatus === "pending" ? "Verification pending" : verificationStatus === "needs_attention" ? "Verification needs attention" : "Verification required";
  const tabs: Array<{ id: DriverSection; label: string; icon: string }> = [
    { id: "home", label: "Home", icon: "⌂" },
    { id: "search", label: "Search", icon: "⌕" },
    { id: "routes", label: "My routes", icon: "↗" },
  ];
  const driverName = profile?.displayName ?? session.displayName;
  const driverEmail = profile?.email ?? session.email;
  const activeOffer = routeOffers.find((offer) => offer.status === "accepted" && offer.deliveryStage !== "completed");
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
          <Pressable style={styles.driverAccountMenuItem} onPress={() => { setSection("impact"); setAccountMenuOpen(false); }}><Text style={styles.driverAccountMenuText}>My impact & badges</Text></Pressable>
          <Pressable style={styles.driverAccountMenuItem} onPress={() => { setSection("report"); setAccountMenuOpen(false); }}><Text style={styles.driverAccountMenuText}>Report problem</Text></Pressable>
          <Pressable style={styles.driverAccountMenuItem} onPress={signOutFromMenu}><Text style={styles.driverLogoutText}>Log out</Text></Pressable>
        </View>}
      </View>
    </View>
    <View style={styles.driverTabs}>{tabs.map((tab) => <Pressable key={tab.id} onPress={() => setSection(tab.id)} style={[styles.driverTab, section === tab.id && styles.driverTabActive]}><Text style={[styles.driverTabIcon, section === tab.id && styles.driverTabTextActive]}>{tab.icon}</Text><Text style={[styles.driverTabText, section === tab.id && styles.driverTabTextActive]}>{tab.label}</Text></Pressable>)}</View>
    <ScrollView contentContainerStyle={styles.driverContent} keyboardShouldPersistTaps="handled">
      {error && section !== "search" ? <Text style={styles.errorText}>{error}</Text> : null}
      {section === "home" && <>{activeOffer ? <><ReservationStateNotice offer={activeOffer} /><LiveRouteOffer offer={activeOffer} onRespond={respondToOffer} onProgress={progressRoute} onCompleteUnattended={completeUnattendedDelivery} onCancel={cancelRoute} onConfirm={confirmReservedRoute} /></> : <><DriverHome displayName={profile?.displayName ?? session.displayName} verificationStatus={verificationStatus} verificationBusy={verificationBusy} onVerify={beginIdentityVerification} onRefreshVerification={refreshIdentityVerification} onSearch={() => setSection("search")} />{driverNotifications.slice(0, 3).map((notification) => <DriverNotificationCard notification={notification} key={notification.id} />)}{browseRoutes.filter((route) => !routeOffers.some((offer) => offer.pickupOccurrenceId === route.pickupId && ["offered", "accepted"].includes(offer.status))).map((route) => <BrowseRouteCard route={route} onReserve={() => reserveBrowseRoute(route)} key={route.id} />)}{routeOffers.filter((offer) => offer.status === "offered").map((offer) => <LiveRouteOffer offer={offer} onRespond={respondToOffer} onProgress={progressRoute} onCompleteUnattended={completeUnattendedDelivery} onCancel={cancelRoute} onConfirm={confirmReservedRoute} key={offer.id} />)}</>}</>}
      {section === "search" && <View><Text style={styles.authEyebrow}>PLAN A DELIVERY</Text><Text style={styles.driverPageTitle}>Search for a route</Text><Text style={styles.authBody}>Choose when you can drive. Starting and destination ZIP codes are optional preferences, not strict limits. If no confirmed pickup exists yet, BakedBoston will notify you when one matches.</Text>{error ? <Text style={[styles.errorText, styles.driverSearchError]}>{error}</Text> : null}<View style={styles.driverSearchCard}><Field label="Date" value={search.date} onChangeText={(date) => setSearch({ ...search, date })} placeholder="YYYY-MM-DD" /><View style={styles.driverSearchTimeRow}><TimeEditorField label="Earliest start" value={search.earliest} onChange={(earliest) => setSearch({ ...search, earliest })} /><TimeEditorField label="Latest finish" value={search.latest} onChange={(latest) => setSearch({ ...search, latest })} /></View><Field label="Preferred starting ZIP (optional)" value={search.startZip} onChangeText={(startZip) => setSearch({ ...search, startZip })} placeholder="Use current location" keyboardType="number-pad" /><Field label="Preferred destination ZIP (optional)" value={search.endZip} onChangeText={(endZip) => setSearch({ ...search, endZip })} placeholder="Anywhere is okay" keyboardType="number-pad" /><Pressable style={styles.locationPreferenceButton} onPress={() => Alert.alert("Current location", "Location permission is used to recommend nearby routes. You can use a ZIP code instead.")}><Text style={styles.locationPreferenceText}>⌖ Use my current location</Text></Pressable><PrimaryButton label="Save ride request & find matches" dark onPress={saveRideRequest} /></View>{searched && <Text style={styles.calendarNotice}>Ride request saved. We’ll notify you when a confirmed pickup matches.</Text>}<DriverRideRequestList requests={rideRequests} /></View>}
      {section === "routes" && <View><Text style={styles.authEyebrow}>DELIVERY ACTIVITY</Text><Text style={styles.driverPageTitle}>My routes</Text>{routeOffers.filter((offer) => ["offered", "accepted"].includes(offer.status)).map((offer) => <LiveRouteOffer offer={offer} onRespond={respondToOffer} onProgress={progressRoute} onCompleteUnattended={completeUnattendedDelivery} onCancel={cancelRoute} onConfirm={confirmReservedRoute} key={offer.id} />)}{!routeOffers.some((offer) => ["offered", "accepted"].includes(offer.status)) && <View style={styles.driverEmptyCard}><Text style={styles.connectedTitle}>No routes yet</Text><Text style={styles.connectedBody}>Reserved, active, and completed deliveries will appear here.</Text><Pressable style={styles.portalFeatureButton} onPress={() => setSection("search")}><Text style={styles.portalFeatureButtonText}>Search for a route</Text></Pressable></View>}</View>}
      {section === "impact" && <DriverImpactPage offers={routeOffers} />}
      {section === "profile" && profile && <DriverProfilePage profile={profile} notice={profileNotice} onChange={setProfile} onSave={async () => { setProfileNotice(""); try { const updated = await saveDriverProfile(profile); setProfile(updated); setProfileNotice("Profile saved."); } catch (reason) { setProfileNotice(reason instanceof Error ? reason.message : "Could not save profile."); } }} onSignOut={onSignOut} onDelete={async () => { try { await deleteDriverAccount(); await SecureStore.deleteItemAsync(TOKEN_KEY); onSignOut(); } catch (reason) { Alert.alert("Account not deleted", reason instanceof Error ? reason.message : "Please try again."); } }} />}
      {section === "report" && <ReportProblemMobile />}
    </ScrollView>
  </SafeAreaView>;
}

function DriverHome({ displayName, verificationStatus, verificationBusy, onVerify, onRefreshVerification, onSearch }: {
  displayName: string;
  verificationStatus: DriverProfile["verificationStatus"];
  verificationBusy: boolean;
  onVerify: () => void;
  onRefreshVerification: () => void;
  onSearch: () => void;
}) {
  const title = verificationStatus === "not_started"
    ? "Verify your identity"
    : verificationStatus === "needs_attention"
      ? "Verification needs attention"
      : "Stripe verification pending";
  const body = verificationStatus === "not_started"
    ? "Complete a secure government ID and selfie check with Stripe before reserving your first route."
    : verificationStatus === "needs_attention"
      ? "Stripe could not complete the previous check. Start another attempt or contact BakedBoston for help."
      : "Stripe is processing your identity check. You can explore routes while verification is underway.";
  return <View><Text style={styles.authEyebrow}>DRIVER HOME</Text><Text style={styles.driverPageTitle}>Hello, {displayName || "driver"}.</Text>{verificationStatus !== "verified" && <View style={styles.driverVerificationCard}><View style={styles.driverVerificationHeading}><View style={styles.verificationHeadingCopy}><Text style={styles.authEyebrow}>BEFORE YOUR FIRST ROUTE</Text><Text style={styles.connectedTitle}>{title}</Text></View><View style={styles.verificationStatusDot} /></View><Text style={styles.connectedBody}>{body}</Text><Pressable disabled={verificationBusy} style={[styles.identityActionButton, verificationBusy && styles.disabledButton]} onPress={verificationStatus === "pending" ? onRefreshVerification : onVerify}><Text style={styles.driverReserveButtonText}>{verificationBusy ? "Please wait…" : verificationStatus === "pending" ? "Check verification status" : "Verify with Stripe"}</Text></Pressable><Text style={styles.identityPrivacyNote}>Identity documents are collected and processed by Stripe. BakedBoston does not store the document images.</Text></View>}<View style={styles.driverFeedHeading}><View><Text style={styles.connectedTitle}>Recommended routes</Text><Text style={styles.connectedBody}>Nearby routes available now or within the next two hours, ranked for efficient travel.</Text></View><Pressable style={styles.driverSearchShortcut} onPress={onSearch}><Text style={styles.driverSearchShortcutText}>Search</Text></Pressable></View></View>;
}

function BrowseRouteCard({ route, onReserve }: { route: BrowseRoute; onReserve: () => void }) {
  const future = new Date(route.departureWindowStartsAt).getTime() > Date.now() + 5 * 60_000;
  return <View style={styles.driverRouteCard}>
    <View style={styles.driverRouteTop}><Text style={styles.driverRouteTiming}>{future ? "Later today" : "Available soon"}</Text><Text style={styles.driverRouteDrive}>{route.distanceToBakeryMiles.toFixed(1)} mi away</Text></View>
    <Text style={styles.driverRouteName}>{route.bakeryName}</Text><View style={styles.driverRouteLine} /><Text style={styles.driverRouteName}>{route.pantryName}</Text>
    <View style={styles.driverRouteFacts}><Text style={styles.driverRouteFact}>Leave {formatMobileTime(route.departureWindowStartsAt)}–{formatMobileTime(route.departureWindowEndsAt)}</Text><Text style={styles.driverRouteFact}>{route.routeMiles.toFixed(1)} route mi</Text></View>
    <Text style={styles.driverRouteReason}>Pickup around {formatMobileTime(route.estimatedBakeryArrival)} · Finish around {formatMobileTime(route.estimatedPantryArrival)}</Text>
    <Pressable style={styles.driverReserveButton} onPress={onReserve}><Text style={styles.driverReserveButtonText}>Reserve this route</Text></Pressable>
  </View>;
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

function DriverImpactPage({ offers }: { offers: DriverRouteOffer[] }) {
  const completed = offers.filter((offer) => offer.deliveryStage === "completed");
  const bakeryCounts = completed.reduce<Record<string, number>>((counts, offer) => {
    if (offer.bakery?.name) counts[offer.bakery.name] = (counts[offer.bakery.name] ?? 0) + 1;
    return counts;
  }, {});
  const pantryCounts = completed.reduce<Record<string, number>>((counts, offer) => {
    if (offer.pantry?.name) counts[offer.pantry.name] = (counts[offer.pantry.name] ?? 0) + 1;
    return counts;
  }, {});
  const maxBakeryDeliveries = Math.max(0, ...Object.values(bakeryCounts));
  const maxPantryDeliveries = Math.max(0, ...Object.values(pantryCounts));
  const badges = [
    { icon: "↗", title: "First delivery", detail: "Complete your first BakedBoston delivery.", earned: completed.length >= 1 },
    { icon: "5", title: "Five deliveries", detail: "Complete five community deliveries.", earned: completed.length >= 5 },
    { icon: "10", title: "Ten deliveries", detail: "Complete ten community deliveries.", earned: completed.length >= 10 },
    { icon: "🥖", title: "Bakery regular", detail: "Complete five pickups from the same bakery.", earned: maxBakeryDeliveries >= 5 },
    { icon: "🥫", title: "Pantry neighbor", detail: "Complete five deliveries to the same pantry.", earned: maxPantryDeliveries >= 5 },
  ];
  return <View>
    <Text style={styles.authEyebrow}>YOUR CONTRIBUTION</Text>
    <Text style={styles.driverPageTitle}>My impact</Text>
    <Text style={styles.authBody}>Your completed deliveries and earned milestones appear here.</Text>
    <View style={styles.impactSummary}>
      <View style={styles.impactMetric}><Text style={styles.impactMetricValue}>{completed.length}</Text><Text style={styles.impactMetricLabel}>Completed deliveries</Text></View>
      <View style={styles.impactMetric}><Text style={styles.impactMetricValue}>{badges.filter((badge) => badge.earned).length}</Text><Text style={styles.impactMetricLabel}>Badges earned</Text></View>
    </View>
    <Text style={styles.impactSectionTitle}>Badges</Text>
    <View style={styles.badgeGrid}>{badges.map((badge) => <View key={badge.title} style={[styles.badgeCard, !badge.earned && styles.badgeCardLocked]}>
      <View style={[styles.badgeIcon, !badge.earned && styles.badgeIconLocked]}><Text style={styles.badgeIconText}>{badge.earned ? badge.icon : "○"}</Text></View>
      <View style={styles.badgeCopy}><Text style={styles.badgeTitle}>{badge.title}</Text><Text style={styles.badgeDetail}>{badge.earned ? "Earned" : badge.detail}</Text></View>
    </View>)}</View>
  </View>;
}

function ReservationStateNotice({ offer }: { offer: DriverRouteOffer }) {
  if (offer.deliveryStage !== "reserved") return null;
  const open = Boolean(offer.departureWindowStartsAt && new Date(offer.departureWindowStartsAt) <= new Date());
  return <View style={styles.driverNotificationCard}>
    <Text style={styles.connectedTitle}>{open ? "You can begin your delivery" : "Route reserved"}</Text>
    <Text style={styles.connectedBody}>{open
      ? `Your recommended departure window is open${offer.departureWindowEndsAt ? `. Try to leave by ${formatMobileTime(offer.departureWindowEndsAt)}` : ""}.`
      : `You can begin your delivery when the recommended departure window opens${offer.departureWindowStartsAt ? ` at ${formatMobileTime(offer.departureWindowStartsAt)}` : ""}.`}</Text>
  </View>;
}

function LiveRouteOffer({ offer, onRespond, onProgress, onCompleteUnattended, onCancel, onConfirm }: {
  offer: DriverRouteOffer;
  onRespond: (offer: DriverRouteOffer, action: "accept-offer" | "decline-offer") => void;
  onProgress: (offer: DriverRouteOffer, stage: DriverRouteOffer["deliveryStage"]) => void;
  onCompleteUnattended: (offer: DriverRouteOffer) => void;
  onCancel: (offer: DriverRouteOffer) => void;
  onConfirm: (offer: DriverRouteOffer) => void;
}) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [helpQuestion, setHelpQuestion] = useState("");
  const bakeryFocused = ["reserved", "en_route_to_bakery", "arrived_at_bakery"].includes(offer.deliveryStage);
  const destination = bakeryFocused ? offer.bakery : offer.pantry;
  const laterDestination = bakeryFocused ? offer.pantry : offer.bakery;
  const arrived = offer.deliveryStage === "arrived_at_bakery" || offer.deliveryStage === "arrived_at_pantry";
  const showDetails = arrived || detailsExpanded;
  const nextAction = offer.deliveryStage === "reserved"
    ? { label: "Begin delivery", stage: "en_route_to_bakery" as const }
    : offer.deliveryStage === "arrived_at_bakery"
    ? { label: "Food picked up", stage: "picked_up" as const }
    : offer.deliveryStage === "picked_up" || offer.deliveryStage === "en_route_to_pantry"
      ? { label: "I have arrived at the pantry", stage: "arrived_at_pantry" as const }
      : offer.deliveryStage === "arrived_at_pantry"
        ? {
          label: offer.pantryServiceMode === "unattended" ? "Take photo & complete delivery" : "Food dropped off · complete delivery",
          stage: "completed" as const,
        }
        : { label: "I have arrived at the bakery", stage: "arrived_at_bakery" as const };
  function continueRoute() {
    if (nextAction.stage === "completed" && offer.pantryServiceMode === "unattended") {
      onCompleteUnattended(offer);
      return;
    }
    if (nextAction.stage !== "en_route_to_bakery") {
      onProgress(offer, nextAction.stage);
      return;
    }
    const pickupStartsAt = offer.pickup?.pickupWindowStartsAt ? new Date(offer.pickup.pickupWindowStartsAt) : null;
    if (pickupStartsAt && pickupStartsAt.getTime() > Date.now()) {
      Alert.alert(
        "Begin before the pickup window?",
        `${offer.bakery?.name ?? "The bakery"} is scheduled to begin pickups at ${formatMobileTime(pickupStartsAt.toISOString())}. You can leave now, but you may need to wait when you arrive.`,
        [
          { text: "Wait", style: "cancel" },
          { text: "Begin delivery", onPress: () => onProgress(offer, "en_route_to_bakery") },
        ],
      );
      return;
    }
    onProgress(offer, "en_route_to_bakery");
  }
  return <View style={[styles.driverRouteCard, styles.liveOfferCard]}>
    <View style={styles.driverRouteTop}><Text style={styles.driverRouteTiming}>{offer.status === "offered" ? "Held for you · 5 minutes" : "Reserved"}</Text><Text style={styles.driverRouteDrive}>{offer.status}</Text></View>
    <Text style={styles.driverRouteName}>{offer.bakery?.name ?? "Bakery pickup"}</Text><View style={styles.driverRouteLine} /><Text style={styles.driverRouteName}>{offer.pantry?.name ?? "Pantry delivery"}</Text>
    <View style={styles.driverRouteFacts}><Text style={styles.driverRouteFact}>Pickup {formatMobileTime(offer.estimatedBakeryArrival)}</Text><Text style={styles.driverRouteFact}>Arrival {formatMobileTime(offer.estimatedPantryArrival)}</Text></View>
    {offer.status === "accepted" && offer.departureWindowStartsAt && offer.departureWindowEndsAt && <Text style={styles.driverRouteReason}>Recommended departure: {formatMobileTime(offer.departureWindowStartsAt)}–{formatMobileTime(offer.departureWindowEndsAt)}</Text>}
    {offer.pantryServiceMode === "unattended" && <View style={styles.unattendedDropoffBanner}>
      <Text style={styles.unattendedDropoffTitle}>Unattended pantry drop-off</Text>
      <Text style={styles.unattendedDropoffBody}>No one will be there to receive the food. Leave it in the designated drop-off area and take a photo before completing the delivery.</Text>
    </View>}
    {offer.status === "accepted" && bakeryFocused && offer.pickupReadyAt && <View style={styles.pickupReadyBanner}><Text style={styles.pickupReadyBannerText}>✓ Bakery confirmed: food is ready for pickup</Text></View>}
    {offer.status === "accepted" && offer.driverConfirmationRequestedAt && !offer.driverConfirmedAt && <View style={styles.driverNotificationCard}><Text style={styles.authEyebrow}>ACTION REQUIRED</Text><Text style={styles.connectedTitle}>Confirm this delivery</Text><Text style={styles.connectedBody}>Confirm by {offer.driverConfirmationDeadlineAt ? formatMobileTime(offer.driverConfirmationDeadlineAt) : "the displayed deadline"} to keep the reservation.</Text><Pressable style={styles.driverReserveButton} onPress={() => onConfirm(offer)}><Text style={styles.driverReserveButtonText}>Confirm delivery</Text></Pressable></View>}
    {offer.status === "offered" && <View style={styles.offerActions}><Pressable style={styles.offerDeclineButton} onPress={() => onRespond(offer, "decline-offer")}><Text style={styles.offerDeclineText}>Not this one</Text></Pressable><Pressable style={[styles.driverReserveButton, styles.offerReserveButton]} onPress={() => onRespond(offer, "accept-offer")}><Text style={styles.driverReserveButtonText}>Reserve this route</Text></Pressable></View>}
    {offer.status === "accepted" && offer.deliveryStage === "completed" && <View style={styles.completedRouteSummary}><Text style={styles.authEyebrow}>DELIVERY COMPLETED</Text><Text style={styles.connectedTitle}>{offer.bakery?.name} → {offer.pantry?.name}</Text></View>}
    {offer.status === "accepted" && offer.deliveryStage !== "completed" && destination && <View style={styles.activeDestination}>
      <Text style={styles.authEyebrow}>{bakeryFocused ? arrived ? "YOU HAVE ARRIVED AT THE BAKERY" : "FIRST DESTINATION · PICKUP" : arrived ? "YOU HAVE ARRIVED AT THE PANTRY" : "NEXT DESTINATION · DELIVERY"}</Text>
      <Text style={styles.activeDestinationName}>{destination.name}</Text>
      <Text style={styles.activeDestinationAddress}>{destination.address}</Text>
      <Pressable style={styles.routeProgressButton} onPress={continueRoute}><Text style={styles.driverReserveButtonText}>{nextAction.label}</Text></Pressable>
      <Pressable style={[styles.primaryDirectionButton, styles.primaryDirectionAfterProgress]} onPress={() => chooseNavigationApp(destination.name, destination.address)}><Text style={styles.portalStatusButtonText}>Open directions</Text></Pressable>
      {!showDetails && <Pressable style={styles.arrivalDetailsToggle} onPress={() => setDetailsExpanded(true)}><Text style={styles.secondaryDirectionText}>View arrival instructions and photos</Text></Pressable>}
      {showDetails && <DestinationArrivalDetails destination={destination} expanded={arrived} onClose={arrived ? undefined : () => setDetailsExpanded(false)} />}
      <Pressable style={styles.deliveryHelpButton} onPress={() => setHelpExpanded((value) => !value)}><Text style={styles.secondaryDirectionText}>I need help</Text></Pressable>
      {helpExpanded && <View style={styles.deliveryHelpPanel}>{[
        ["bakery", "I can’t find or reach the bakery", "Open directions and review the arrival instructions. If the address or instructions are incorrect, report the problem from your account menu."],
        ["food", "The food is not ready", "Wait somewhere safe and contact the bakery using the displayed business information. Do not mark the food picked up until you have it."],
        ["pantry", "I can’t find the pantry drop-off", "Review the pantry instructions and photos before leaving the food. For unattended deliveries, photograph the food at the correct drop-off point."],
        ["delay", "I’m delayed", "Continue only if you can safely complete the route. BakedBoston recalculates ETAs as the delivery progresses."],
      ].map(([id, question, answer]) => <Pressable key={id} style={styles.deliveryHelpQuestion} onPress={() => setHelpQuestion(helpQuestion === id ? "" : id)}><Text style={styles.deliveryHelpQuestionText}>{question}</Text>{helpQuestion === id && <Text style={styles.deliveryHelpAnswer}>{answer}</Text>}</Pressable>)}<Text style={styles.deliveryHelpImmediate}>Need immediate support?</Text><Pressable onPress={() => Linking.openURL("tel:+16172332956")}><Text style={styles.mobileSupportPhone}>Call 617-233-2956</Text></Pressable></View>}
      {!["picked_up", "en_route_to_pantry", "arrived_at_pantry", "completed"].includes(offer.deliveryStage) && <Pressable style={styles.cancelDeliveryButton} onPress={() => onCancel(offer)}><Text style={styles.offerDeclineText}>Cancel delivery</Text></Pressable>}
      {laterDestination && <View style={styles.routeSecondaryDestination}><Text style={styles.previewLabel}>{bakeryFocused ? "AFTER PICKUP" : "PICKED UP FROM"}</Text><Text style={styles.connectedTitle}>{laterDestination.name}</Text><Text style={styles.connectedBody}>{laterDestination.address}</Text></View>}
    </View>}
  </View>;
}

function DestinationArrivalDetails({ destination, expanded, onClose }: { destination: DriverDestination; expanded: boolean; onClose?: () => void }) {
  return <View style={[styles.arrivalDetails, expanded && styles.arrivalDetailsExpanded]}>
    <View style={styles.arrivalDetailsHeading}><Text style={styles.connectedTitle}>Arrival instructions</Text>{onClose && <Pressable onPress={onClose}><Text style={styles.arrivalDetailsClose}>×</Text></Pressable>}</View>
    <Text style={[styles.connectedBody, expanded && styles.arrivalInstructionsExpanded]}>{destination.dropoffInstructions || "No additional arrival instructions were provided."}</Text>
    {destination.photos.length > 0 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.arrivalPhotoRow}>{destination.photos.map((photo) => <View style={[styles.arrivalPhotoCard, expanded && styles.arrivalPhotoCardExpanded]} key={photo.id}><Image source={{ uri: photo.imageUrl }} style={[styles.arrivalPhoto, expanded && styles.arrivalPhotoExpanded]} /><Text style={styles.arrivalPhotoCaption}>{photo.caption || "Access photo"}</Text></View>)}</ScrollView> : <Text style={styles.arrivalNoPhotos}>No access photos were provided.</Text>}
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

function DriverProfilePage({ profile, notice, onChange, onSave, onSignOut, onDelete }: { profile: DriverProfile; notice: string; onChange: (profile: DriverProfile) => void; onSave: () => void; onSignOut: () => void; onDelete: () => Promise<void> }) {
  function confirmDeletion() {
    Alert.alert("Delete your BakedBoston account?", "This permanently deletes your driver profile, saved ride requests, route assignments, notifications, and login access. This cannot be undone.", [
      { text: "Keep account", style: "cancel" },
      { text: "Delete account", style: "destructive", onPress: () => void onDelete() },
    ]);
  }
  return <View><Text style={styles.authEyebrow}>DRIVER ACCOUNT</Text><Text style={styles.driverPageTitle}>Profile</Text><View style={styles.driverProfileCard}><Field label="Legal name" value={profile.displayName} onChangeText={(displayName) => onChange({ ...profile, displayName })} /><Field label="Account email" value={profile.email} onChangeText={(email) => onChange({ ...profile, email })} keyboardType="email-address" autoCapitalize="none" /><Field label="Mobile number" value={profile.phone} onChangeText={(phone) => onChange({ ...profile, phone })} keyboardType="phone-pad" /><Field label="Home address" value={profile.homeAddress} onChangeText={(homeAddress) => onChange({ ...profile, homeAddress })} /><Field label="Home ZIP code" value={profile.homeZip} onChangeText={(homeZip) => onChange({ ...profile, homeZip })} keyboardType="number-pad" /><Field label="Date of birth" value={profile.dateOfBirth} editable={false} /><Text style={styles.privateProfileNote}>Your address and date of birth are private and are not shown to bakeries or pantries.</Text>{notice ? <Text style={styles.calendarNotice}>{notice}</Text> : null}<PrimaryButton label="Save profile" dark onPress={onSave} /></View><Pressable onPress={onSignOut}><Text style={styles.workspaceSignOut}>Sign out</Text></Pressable><Pressable onPress={confirmDeletion}><Text style={styles.deleteAccountLink}>Delete account</Text></Pressable></View>;
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
async function deleteDriverAccount() {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const response = await fetch(`${API_URL}/api/mobile/driver`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Could not delete this account.");
}
async function driverIdentityRequest(method: "GET" | "POST") {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const response = await fetch(`${API_URL}/api/mobile/driver/identity`, {
    method,
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Identity verification request failed.");
  return data as IdentityVerificationResponse;
}
async function driverMatchingRequest(method: "GET" | "POST" | "PATCH", body?: Record<string, unknown>, coordinates?: { latitude: number; longitude: number } | null) {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const query = coordinates ? `?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}` : "";
  const response = await fetch(`${API_URL}/api/mobile/driver/requests${query}`, {
    method,
    headers: { Authorization: `Bearer ${token ?? ""}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Driver matching request failed.");
  return data as { request: DriverRideRequest; requests: DriverRideRequest[]; offers: DriverRouteOffer[]; notifications: DriverNotification[]; browseRoutes: BrowseRoute[] };
}
async function loadDriverMatching(coordinates?: { latitude: number; longitude: number } | null) { return driverMatchingRequest("GET", undefined, coordinates); }
async function currentDriverCoordinates() {
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    const requested = await Location.requestForegroundPermissionsAsync();
    if (requested.status !== "granted") return null;
  }
  const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: location.coords.latitude, longitude: location.coords.longitude };
}
async function registerForPushNotifications() {
  if (!Device.isDevice) return;
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;
  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const response = await fetch(`${API_URL}/api/mobile/push-device`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expoPushToken, platform: Platform.OS }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "This phone could not be registered for notifications.");
  return data.device;
}
async function createDriverRideRequest(request: DriverRideRequest) {
  return driverMatchingRequest("POST", {
    serviceDate: request.serviceDate, earliestStart: request.earliestStart, latestFinish: request.latestFinish,
    startZip: request.startZip, endZip: request.endZip, maximumExtraMinutes: request.maximumExtraMinutes,
  });
}
async function updateDriverMatching(body: Record<string, unknown>) { return driverMatchingRequest("PATCH", body); }

type PartnerSection = "overview" | "activity" | "schedule" | "profile" | "report";

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
    void registerForPushNotifications()
      .then(() => undefined)
      .catch((error) => Alert.alert("Notifications not connected", error instanceof Error ? error.message : "Please try signing in again."));
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
    { key: "report", icon: "!", label: "Report problem" },
  ];
  const title = section === "overview" ? "Good afternoon." : nav.find((item) => item.key === section)?.label ?? "";

  return (
    <SafeAreaView style={styles.portalSafe} edges={landscape ? ["top"] : ["top", "bottom"]}>
      <View style={[styles.portalShell, landscape ? styles.portalLandscape : styles.portalPortrait]}>
        {landscape ? (
          <View style={[styles.portalSidebar, { width: 238 + insets.left, paddingLeft: 18 + insets.left }]}>
            <ScrollView
              style={styles.portalSidebarScroller}
              contentContainerStyle={[styles.portalSidebarContent, { paddingBottom: 20 + insets.bottom }]}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
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
            </ScrollView>
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
  const stableWorkspace = workspace;
  const completed = workspace.routes.filter((route) => route.status === "completed");
  const now = new Date();
  const thisMonth = workspace.routes.filter((route) => {
    const date = new Date(route.createdAt);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const activeOneTime = workspace.availabilityWindows.find((window) => !window.paused && new Date(window.startsAt) <= now && new Date(window.endsAt) > now);
  const pausedOneTime = workspace.availabilityWindows.find((window) => window.paused && new Date(window.startsAt) <= now && new Date(window.endsAt) > now);
  const paused = workspace.availabilityPauses.some((pause) => new Date(pause.endsAt) > now);
  const chronologicalOpenPickups = [...workspace.pickupOccurrences]
    .filter((occurrence) =>
      new Date(occurrence.pickupDeadline) > now
      && !["fulfilled", "cancelled", "insufficient_food"].includes(occurrence.status),
    )
    .sort((a, b) => new Date(a.pickupWindowStartsAt).getTime() - new Date(b.pickupWindowStartsAt).getTime());
  const activeOneTimePickup = activeOneTime
    ? workspace.pickupOccurrences.find((occurrence) =>
      new Date(occurrence.pickupWindowStartsAt).getTime() === new Date(activeOneTime.startsAt).getTime()
      && occurrence.status !== "cancelled",
    )
    : undefined;
  const currentTimedPickup = workspace.pickupOccurrences.find((occurrence) =>
    occurrence.status !== "cancelled"
    && new Date(occurrence.pickupWindowStartsAt) <= now
    && new Date(occurrence.pickupDeadline) > now,
  );
  const todayPickup = activeOneTimePickup
    ?? currentTimedPickup
    ?? chronologicalOpenPickups[0]
    ?? workspace.pickupOccurrences.find((occurrence) => occurrence.serviceDate === localDateString(now));
  const hasActiveRoute = workspace.routes.some((route) => route.status === "reserved" || route.status === "ongoing");
  const notificationAppliesToCurrentPickup = (notification: DriverNotification) => {
    if (hasActiveRoute && notification.eventType === "delivery_completed") return false;
    if (notification.eventType !== "pickup_commitment_reminder") return true;
    const pickupId = Number(notification.threadKey.match(/^pickup:(\d+)$/)?.[1] ?? 0);
    return pickupId > 0 && pickupId === todayPickup?.id;
  };
  const priorityNotification = workspace.notifications.find((notification) =>
    notification.actionRequired && !notification.acknowledgedAt && notificationAppliesToCurrentPickup(notification))
    ?? workspace.notifications.find((notification) => !notification.acknowledgedAt && notificationAppliesToCurrentPickup(notification));
  const pantryConfirmationNeeded = !bakery && workspace.notifications.some((notification) =>
    notification.actionKey.startsWith("pantry-open:") && notification.actionRequired && !notification.acknowledgedAt);
  const pickupConfirmed = todayPickup?.status === "confirmed" || todayPickup?.status === "reserved";
  const pickupFulfilled = todayPickup?.status === "fulfilled";
  const scheduledBakeryOpen = bakery && mobileBakeryWindowIsOpen(workspace, now)
    && !workspace.scheduleExceptions.some((exception) => exception.exceptionDate === localDateString(now));
  const bakeryAvailable = bakery && !paused && (Boolean(activeOneTime && pickupConfirmed) || (scheduledBakeryOpen && pickupConfirmed));
  async function changeAvailability(action: "pause" | "resume" | "pause-one-time" | "resume-one-time") {
    if ((action === "pause-one-time" || action === "resume-one-time") && (activeOneTime || pausedOneTime)) {
      const window = activeOneTime ?? pausedOneTime!;
      await workspaceRequest("PATCH", { action: "set-one-time-paused", id: window.id, paused: action === "pause-one-time" });
    } else if (action === "resume") {
      const pause = stableWorkspace.availabilityPauses.find((item) => new Date(item.endsAt) > now);
      if (pause) await workspaceRequest("DELETE", undefined, `?type=pause&id=${pause.id}`);
    } else {
      await workspaceRequest("POST", { action: "pause-availability", endsAt: mobileAvailabilityEnd(stableWorkspace, bakery, now) });
    }
    await onChanged();
  }
  if (section === "overview") {
    return <ScrollView contentContainerStyle={[styles.portalContent, landscape && { paddingRight: 28 + rightInset }, !landscape && styles.portalContentMobile]} showsVerticalScrollIndicator={false}>
      <View style={[styles.portalStatusCard, !landscape && styles.portalStatusCardMobile]}>
        <View style={styles.portalStatusCopy}>
          <View style={styles.portalStatusHeaderRow}>
            <View style={styles.portalStatusLabel}><View style={[styles.portalStatusDot, paused && styles.portalStatusDotPaused]} /><Text style={styles.portalStatusLabelText}>{bakery ? pickupFulfilled ? "PICKUP COMPLETE" : paused ? "PICKUP AVAILABILITY PAUSED" : activeOneTime && !pickupConfirmed ? "AWAITING PICKUP CONFIRMATION" : activeOneTime ? "ONE-TIME PICKUP OPEN" : bakeryAvailable ? "PICKUP WINDOW OPEN" : pickupConfirmed ? "PICKUP CONFIRMED" : scheduledBakeryOpen ? "AWAITING PICKUP CONFIRMATION" : "PICKUP WINDOW CLOSED" : paused ? "AVAILABILITY PAUSED" : activeOneTime ? "ONE-TIME WINDOW OPEN" : "SCHEDULE CONNECTED"}</Text></View>
            {landscape && <View style={styles.portalStatusHeaderActions}>
              {activeOneTime && (!bakery || pickupConfirmed) && <Pressable style={styles.portalStatusHeaderPrimary} onPress={() => changeAvailability("pause-one-time")}><Text style={styles.portalStatusHeaderActionText}>Pause availability</Text></Pressable>}
              {pausedOneTime && <Pressable style={styles.portalStatusHeaderPrimary} onPress={() => changeAvailability("resume-one-time")}><Text style={styles.portalStatusHeaderActionText}>Resume availability</Text></Pressable>}
              {!activeOneTime && !pausedOneTime && paused && <Pressable style={styles.portalStatusHeaderPrimary} onPress={() => changeAvailability("resume")}><Text style={styles.portalStatusHeaderActionText}>Resume availability</Text></Pressable>}
              {!activeOneTime && !pausedOneTime && !paused && bakeryAvailable && <Pressable style={styles.portalStatusHeaderPrimary} onPress={() => changeAvailability("pause")}><Text style={styles.portalStatusHeaderActionText}>Pause availability</Text></Pressable>}
              <Pressable style={styles.portalStatusHeaderLink} onPress={() => onNavigate("schedule")}><Text style={styles.portalStatusHeaderActionText}>{bakery ? "Pickup schedule →" : "Receiving schedule →"}</Text></Pressable>
            </View>}
          </View>
          <Text style={styles.portalStatusTitle}>{pickupFulfilled ? "Today’s pickup is complete." : pantryConfirmationNeeded ? "Confirm that your pantry is open for deliveries." : paused ? (bakery ? "Pickup availability is paused." : "Delivery availability is paused.") : bakery ? activeOneTime && !pickupConfirmed ? "This one-time pickup is awaiting confirmation." : bakeryAvailable ? "The confirmed pickup window is open." : scheduledBakeryOpen && !pickupConfirmed ? todayPickup?.status === "insufficient_food" ? "No pickup is available today." : "Today’s pickup window is awaiting confirmation." : pickupConfirmed ? "Today’s pickup is confirmed." : "No pickup window is open right now." : "Manage today’s delivery availability."}</Text>
          <Text style={styles.portalStatusBody}>{pickupFulfilled && todayPickup
            ? `${formatMobileDate(todayPickup.pickupWindowStartsAt)} · ${formatMobileTime(todayPickup.pickupWindowStartsAt)}–${formatMobileTime(todayPickup.pickupDeadline)} · Food for this window has been picked up, and the bakery has been excluded from any more pickups during this window.`
            : activeOneTime ? `${formatMobileDate(activeOneTime.startsAt)} · ${formatMobileTime(activeOneTime.startsAt)}–${formatMobileTime(activeOneTime.endsAt)}${bakery && !pickupConfirmed ? " · Confirm food availability below before drivers can reserve it." : ""}`
              : bakery ? bakeryAvailable ? "This window opened automatically because today’s pickup was confirmed." : pickupConfirmed && todayPickup ? `Confirmed for ${formatMobileTime(todayPickup.pickupWindowStartsAt)}–${formatMobileTime(todayPickup.pickupDeadline)}. This card will open when the window begins.` : scheduledBakeryOpen ? "Confirm today’s pickup before it can be offered to drivers." : `Recurring days: ${workspace.organization.recurringDays || "No recurring schedule"}`
                : `Recurring days: ${workspace.organization.recurringDays || "No recurring schedule"}`}</Text>
          {priorityNotification && <PartnerMobileNotificationCard notification={priorityNotification} onChanged={onChanged} compact />}
          {bakery && <NativePickupConfirmation occurrence={todayPickup} onChanged={onChanged} showSummary={!priorityNotification} />}
        </View>
        {!landscape && <View style={[styles.portalStatusActions, styles.portalStatusActionsMobile]}>
          {activeOneTime && (!bakery || pickupConfirmed) && <Pressable style={styles.portalStatusButton} onPress={() => changeAvailability("pause-one-time")}><Text style={styles.portalStatusButtonText}>Pause availability</Text></Pressable>}
          {pausedOneTime && <Pressable style={styles.portalStatusButton} onPress={() => changeAvailability("resume-one-time")}><Text style={styles.portalStatusButtonText}>Resume availability</Text></Pressable>}
          {!activeOneTime && !pausedOneTime && paused && <Pressable style={styles.portalStatusButton} onPress={() => changeAvailability("resume")}><Text style={styles.portalStatusButtonText}>Resume availability</Text></Pressable>}
          {!activeOneTime && !pausedOneTime && !paused && bakeryAvailable && <Pressable style={styles.portalStatusButton} onPress={() => changeAvailability("pause")}><Text style={styles.portalStatusButtonText}>Pause availability</Text></Pressable>}
          <Pressable style={styles.portalStatusSecondaryButton} onPress={() => onNavigate("schedule")}><Text style={styles.portalStatusButtonText}>{bakery ? "View pickup schedule" : "View receiving schedule"}</Text></Pressable>
        </View>}
      </View>
      <View style={[styles.portalMetrics, !landscape && styles.portalMetricsMobile]}>
        <MetricCard value={workspace.nextArrival ? formatMobileDateTime(workspace.nextArrival) : "—"} label="Next arrival" />
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
  if (section === "report") return <ScrollView contentContainerStyle={[styles.portalContent, landscape && { paddingRight: 28 + rightInset }, !landscape && styles.portalContentMobile]}><ReportProblemMobile /></ScrollView>;
  return <ProfilePage workspace={workspace} bakery={bakery} rightInset={rightInset} onChanged={onChanged} />;
}

const mobileReportCategories = [
  ["failed_pickup", "Failed pickup"], ["failed_delivery", "Failed delivery"], ["food_unavailable", "Food unavailable"],
  ["driver_no_show", "Driver did not arrive"], ["organization_unavailable", "Organization unavailable"],
  ["incorrect_instructions", "Incorrect instructions"], ["difficult_interaction", "Difficult interaction"],
  ["notification_problem", "Notification problem"], ["technical_problem", "Technical problem"], ["safety_concern", "Safety concern"], ["other", "Other"],
] as const;

function ReportProblemMobile({ routeOfferId, demo = false }: { routeOfferId?: number; demo?: boolean }) {
  const [category, setCategory] = useState("technical_problem");
  const [urgency, setUrgency] = useState<"routine" | "urgent" | "safety">("routine");
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState("");
  async function submit() {
    if (!details.trim()) { Alert.alert("Add details", "Please describe what happened."); return; }
    if (demo) { setMessage("Prototype report recorded for this session."); setDetails(""); return; }
    try {
      const result = await submitMobileReport({ category, urgency, details, routeOfferId });
      setMessage(`Your report was sent to the BakedBoston administrator team. Report ID: BBR-${String(result.report.id).padStart(6, "0")}.`); setDetails("");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Could not send this report."); }
  }
  return <View style={styles.reportProblemCard}>
    <Text style={styles.authEyebrow}>REPORT PROBLEM</Text>
    <Text style={styles.connectedTitle}>How can BakedBoston help?</Text>
    <Text style={styles.connectedBody}>Select the closest issue and describe what happened. Include delivery details when applicable.</Text>
    <Text style={styles.mobileReportLabel}>PROBLEM TYPE</Text>
    <View style={styles.mobileReportChoices}>{mobileReportCategories.map(([value, label]) => <Pressable key={value} onPress={() => setCategory(value)} style={[styles.mobileReportChoice, category === value && styles.mobileReportChoiceSelected]}><Text style={[styles.mobileReportChoiceText, category === value && styles.mobileReportChoiceTextSelected]}>{label}</Text></Pressable>)}</View>
    <Text style={styles.mobileReportLabel}>URGENCY</Text>
    <View style={styles.mobileReportChoices}>{(["routine", "urgent", "safety"] as const).map((value) => <Pressable key={value} onPress={() => setUrgency(value)} style={[styles.mobileReportChoice, urgency === value && styles.mobileReportChoiceSelected]}><Text style={[styles.mobileReportChoiceText, urgency === value && styles.mobileReportChoiceTextSelected]}>{value === "routine" ? "Routine" : value === "urgent" ? "Urgent" : "Safety concern"}</Text></Pressable>)}</View>
    <Field label="What happened?" value={details} onChangeText={setDetails} placeholder="Include the time, delivery, people involved, and what help you need." multiline />
    <PrimaryButton label="Send report" dark onPress={submit} />
    {(urgency === "urgent" || urgency === "safety") && <View style={styles.mobileSupportCallout}><Text style={styles.connectedTitle}>Need help during an active delivery?</Text><Pressable onPress={() => Linking.openURL("tel:+16172332956")}><Text style={styles.mobileSupportPhone}>Call BakedBoston support{"\n"}617-233-2956</Text></Pressable>{urgency === "safety" && <Text style={styles.mobileSafetyText}>If anyone is in immediate danger, call 911.</Text>}</View>}
    {message ? <Text style={styles.calendarNotice}>{message}</Text> : null}
  </View>;
}

function NativePickupConfirmation({ occurrence, onChanged, showSummary }: { occurrence?: PickupOccurrence; onChanged: () => Promise<void>; showSummary: boolean }) {
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
    if (status === "confirmed") Alert.alert("Pickup confirmed", data.matching?.matchedRequests ? `${data.matching.matchedRequests} saved driver requests matched this pickup.` : "Drivers can now reserve a route that includes this pickup.");
  }
  if (!occurrence) return null;
  const confirmed = ["confirmed", "reserved"].includes(occurrence.status);
  const fulfilled = occurrence.status === "fulfilled";
  const unavailable = ["insufficient_food", "cancelled"].includes(occurrence.status);
  return <View style={styles.nativePickupStatusControls}>
    {showSummary && <><Text style={styles.portalPanelKicker}>TODAY’S PICKUP COMMITMENT</Text><Text style={styles.statusNotificationTitle}>{fulfilled ? "Today’s food was picked up." : occurrence.status === "reserved" ? "A driver reserved this pickup." : confirmed ? "Pickup confirmed." : unavailable ? "No pickup today." : occurrence.status === "decision_deferred" ? "Decision postponed." : "Will food be available?"}</Text><Text style={styles.statusNotificationBody}>{formatMobileTime(occurrence.pickupWindowStartsAt)}–{formatMobileTime(occurrence.pickupDeadline)} · {fulfilled ? "This bakery is no longer available for matching today." : confirmed ? "Available for advance matching." : "Confirming allows drivers to reserve this pickup."}</Text></>}
    {!showSummary && !fulfilled && <View style={styles.pickupWindowBeingConfirmed}><Text style={styles.portalPanelKicker}>WINDOW BEING CONFIRMED</Text><Text style={styles.pickupWindowBeingConfirmedText}>{formatMobileDate(occurrence.pickupWindowStartsAt)} · {formatMobileTime(occurrence.pickupWindowStartsAt)}–{formatMobileTime(occurrence.pickupDeadline)}</Text></View>}
    {!fulfilled && occurrence.status !== "reserved" && <View style={styles.nativePickupActions}>
      {!confirmed && <Pressable disabled={busy} style={[styles.nativePickupChoice, styles.nativeConfirmPickup]} onPress={() => respond("confirmed")}><Text style={styles.portalStatusButtonText}>{unavailable ? "Change to food available" : "Food will be available"}</Text></Pressable>}
      {confirmed && <Pressable disabled={busy} style={styles.nativePickupChoice} onPress={() => respond("insufficient_food")}><Text style={styles.statusCardLink}>Change to not enough food</Text></Pressable>}
      {!confirmed && !unavailable && <Pressable disabled={busy} style={styles.nativePickupChoice} onPress={() => respond("decision_deferred")}><Text style={styles.statusCardLink}>Don’t know yet</Text></Pressable>}
      {!confirmed && !unavailable && <Pressable disabled={busy} style={styles.nativePickupChoice} onPress={() => respond("insufficient_food")}><Text style={styles.statusCardLink}>Not enough food</Text></Pressable>}
    </View>}
  </View>;
}

function PartnerMobileNotificationCard({ notification, onChanged, compact = false }: { notification: DriverNotification; onChanged: () => Promise<void>; compact?: boolean }) {
  async function acknowledge(handoffAction?: "confirm-handoff" | "handoff-not-picked-up", deliveryReceived?: boolean) {
    try {
      const pickupReady = notification.actionKey.startsWith("pickup-ready:");
      const handoff = notification.actionKey.startsWith("confirm-handoff:");
      const delivery = notification.actionKey.startsWith("confirm-delivery:");
      await mobileNotificationsRequest("PATCH", pickupReady
        ? { action: "pickup-ready", offerId: Number(notification.actionKey.split(":")[1]) }
        : handoff
          ? { action: handoffAction ?? "confirm-handoff", offerId: Number(notification.actionKey.split(":")[1]) }
          : delivery
            ? { action: "confirm-delivery", offerId: Number(notification.actionKey.split(":")[1]), received: deliveryReceived }
          : { id: notification.id, acknowledge: true });
      await onChanged();
    } catch (reason) {
      Alert.alert("Could not acknowledge notification", reason instanceof Error ? reason.message : "Please try again.");
    }
  }
  const handoff = notification.actionKey.startsWith("confirm-handoff:");
  const delivery = notification.actionKey.startsWith("confirm-delivery:");
  const pantryOpening = notification.actionKey.startsWith("pantry-open:");
  const arrivedAt = Number(notification.actionKey.split(":")[2] ?? 0);
  const canReportMissing = handoff && arrivedAt > 0 && Date.now() - arrivedAt >= 15 * 60_000;
  return <View style={compact ? styles.statusNotificationMobile : styles.driverNotificationCard}>
    <Text style={compact ? styles.portalPanelKicker : styles.authEyebrow}>{notification.actionRequired ? "ACTION REQUIRED" : "DELIVERY UPDATE"}</Text>
    <Text style={compact ? styles.statusNotificationTitle : styles.connectedTitle}>{notification.title}</Text>
    <Text style={compact ? styles.statusNotificationBody : styles.connectedBody}>{notification.body}</Text>
    {notification.actionRequired && !notification.acknowledgedAt && <View style={[styles.notificationActionRow, compact && styles.notificationActionRowCompact]}>
      <Pressable style={[styles.nativeNotificationButton, compact && styles.statusNotificationButton]} onPress={() => acknowledge(handoff ? "confirm-handoff" : undefined, delivery ? true : undefined)}>
        <Text style={styles.portalStatusButtonText}>{notification.actionKey.startsWith("pickup-ready:") ? "Food is ready for pickup" : handoff ? "Confirm food was picked up" : delivery ? "Confirm food was dropped off" : pantryOpening ? "We’re open and accepting deliveries" : "Acknowledge"}</Text>
      </Pressable>
      {delivery && <Pressable style={styles.notificationSecondaryButton} onPress={() => Alert.alert("Delivery was not there?", "BakedBoston administrators will be notified so they can review the delivery.", [{ text: "Cancel", style: "cancel" }, { text: "Report missing", style: "destructive", onPress: () => acknowledge(undefined, false) }])}><Text style={styles.statusCardLink}>Delivery was not there</Text></Pressable>}
      {canReportMissing && <Pressable style={styles.notificationSecondaryButton} onPress={() => Alert.alert("Food not picked up?", "BakedBoston administrators will be notified about the pickup issue.", [{ text: "Cancel", style: "cancel" }, { text: "Report issue", style: "destructive", onPress: () => acknowledge("handoff-not-picked-up") }])}><Text style={styles.statusCardLink}>Food was not picked up</Text></Pressable>}
    </View>}
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

function mobileBakeryWindowIsOpen(workspace: WorkspaceData, now: Date) {
  const window = mobileBakeryWindowForToday(workspace);
  if (!window) return false;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return window.readyTime <= time && time <= window.pickupDeadline;
}

function mobileAvailabilityEnd(workspace: WorkspaceData, bakery: boolean, now: Date) {
  if (bakery) {
    const window = mobileBakeryWindowForToday(workspace);
    if (window) return mobileLocalDateTime(localDateString(now), window.pickupDeadline);
  } else {
    const row = nativeScheduleRows(workspace, false).find((item) => item.day === nativeDays[now.getDay()]);
    if (row) return mobileLocalDateTime(localDateString(now), row.close);
  }
  return new Date(now.getTime() + 2 * 60 * 60_000).toISOString();
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
    <View style={styles.routeCopy}><Text style={styles.routeTitle}>{bakery ? `Delivery to ${route.pantryName}` : `Delivery from ${route.bakeryName}`}</Text><Text style={styles.routeDetail}>{route.driverName} · {formatMobileDateTime(route.scheduledArrival)}</Text>{route.deliveryProofUrl ? <Image source={{ uri: route.deliveryProofUrl }} style={styles.deliveryProofImage} /> : null}</View>
    <Text style={styles.routeStatus}>{route.status === "completed" ? "delivered" : route.status}</Text>
  </View>)}</View>;
}

function ActivityPage({ workspace, bakery, rightInset }: { workspace: WorkspaceData; bakery: boolean; rightInset: number }) {
  return <ScrollView contentContainerStyle={[styles.portalContent, { paddingRight: 28 + rightInset }]}>
    <View style={styles.portalPanel}>
      <Text style={styles.portalPanelKicker}>DELIVERY HISTORY</Text>
      <Text style={styles.portalFeatureBody}>Reserved, ongoing, and completed deliveries are synchronized with the BakedBoston web portal.</Text>
      <RouteList routes={workspace.routes} bakery={bakery} />
      {!bakery && <PantryImpactShareMobile workspace={workspace} />}
    </View>
  </ScrollView>;
}

function PantryImpactShareMobile({ workspace }: { workspace: WorkspaceData }) {
  const completed = workspace.routes.filter((route) => route.status === "completed").sort((left, right) => new Date(right.scheduledArrival || right.createdAt).getTime() - new Date(left.scheduledArrival || left.createdAt).getTime()).slice(0, 5);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function choosePhoto(source: "camera" | "library") {
    const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setNotice(source === "camera" ? "Camera permission is required to take a photo." : "Photo-library permission is required to choose a photo.");
    const result = source === "camera" ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) setPhoto(result.assets[0]);
  }
  async function share() {
    if (!selectedRouteId || !photo || !consent) return setNotice("Choose a completed delivery, photo, and consent before sharing.");
    setBusy(true); setNotice("");
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const imageResponse = await fetch(photo.uri);
      const imageBytes = await imageResponse.arrayBuffer();
      const response = await fetch(`${API_URL}/api/mobile/pantry-impact-photos`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token ?? ""}`,
          "Content-Type": photo.mimeType ?? "image/jpeg",
          "X-BakedBoston-Upload": "pantry-impact",
          "X-Rescue-Route-Id": String(selectedRouteId),
          "X-File-Name": photo.fileName ?? `impact-photo-${Date.now()}.jpg`,
          "X-Impact-Caption": encodeURIComponent(caption),
          "X-Social-Consent": "true",
        },
        body: imageBytes,
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) { setPhoto(null); setCaption(""); setConsent(false); setSelectedRouteId(null); setNotice("Thank you for sharing this delivery’s impact."); }
      else setNotice(data.error ?? "Could not upload the impact photo.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not upload the impact photo.");
    } finally {
      setBusy(false);
    }
  }
  return <View style={styles.impactShareMobile}>
    <Text style={styles.portalPanelKicker}>SHARE THE IMPACT</Text>
    <Text style={styles.connectedTitle}>Show what arrived.</Text>
    <Text style={styles.connectedBody}>After a completed delivery, share a photo of the bakery food at your pantry. Photos with pantry patrons are not allowed.</Text>
    {!completed.length ? <Text style={styles.profileHelp}>Complete a delivery to share an impact photo.</Text> : <>
      <Text style={styles.mobileReportLabel}>COMPLETED DELIVERY</Text>
      <View style={styles.impactRouteChoices}>{completed.map((route) => <Pressable key={route.id} style={[styles.impactRouteChoice, selectedRouteId === route.id && styles.impactRouteChoiceSelected]} onPress={() => setSelectedRouteId(route.id)}><Text style={[styles.impactRouteText, selectedRouteId === route.id && styles.impactRouteTextSelected]}>{route.bakeryName} · {formatMobileDateTime(route.scheduledArrival)}</Text></Pressable>)}</View>
      {photo && <Image source={{ uri: photo.uri }} style={styles.impactPhotoPreview} />}
      <View style={styles.photoSourceButtons}><Pressable style={styles.photoSourceButton} onPress={() => void choosePhoto("camera")}><Text style={styles.calendarAddButtonText}>Take photo</Text></Pressable><Pressable style={styles.photoSourceButton} onPress={() => void choosePhoto("library")}><Text style={styles.calendarAddButtonText}>Choose photo</Text></Pressable></View>
      <EditorField label="Caption (optional)" value={caption} onChangeText={setCaption} />
      <Pressable style={styles.impactConsentMobile} onPress={() => setConsent((value) => !value)}><View style={[styles.impactConsentBox, consent && styles.impactConsentBoxChecked]}><Text style={styles.impactConsentCheck}>{consent ? "✓" : ""}</Text></View><Text style={styles.impactConsentText}>I confirm this photo contains no pantry patrons, and I give BakedBoston permission to use it in social media and promotional materials.</Text></Pressable>
      <PrimaryButton label={busy ? "Sharing…" : "Share impact photo"} dark onPress={() => void share()} />
    </>}
    {notice ? <Text style={styles.calendarNotice}>{notice}</Text> : null}
    {workspace.impactPhotos.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accessPhotoList}>{workspace.impactPhotos.map((item) => <View style={styles.accessPhotoCard} key={item.id}><Image source={{ uri: item.imageUrl }} style={styles.accessPhotoImage} /><Text style={styles.accessPhotoCaption} numberOfLines={2}>{item.caption || "Shared pantry impact"}</Text></View>)}</ScrollView>}
  </View>;
}

type NativeScheduleRow = { recurrence: "weekly" | "monthly"; day: string; ordinal: number | null; open: string; close: string; latestArrival: string; serviceMode: "staffed" | "unattended"; businessOpen: string; businessClose: string; readyTime: string; pickupDeadline: string };
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
  const adding = !date;
  const heading = <View style={[styles.editorHeading, styles.recurringEditorHeading]}><View><Text style={styles.portalPanelKicker}>{adding ? "ADD RECURRING" : "EDIT WINDOW"}</Text><Text style={styles.editorTitle}>{adding ? "New window" : "Edit existing window"}</Text></View><Pressable onPress={onClose}><Text style={styles.editorClose}>×</Text></Pressable></View>;
  const days = <View style={[styles.choiceRow, compact && styles.landscapeDayRow]}>{nativeDays.map((day) => <Pressable key={day} onPress={() => onChange({ day })} style={[styles.choicePill, compact && styles.landscapeDayPill, row.day === day && styles.choicePillSelected]}><Text style={[styles.choiceText, row.day === day && styles.choiceTextSelected]}>{day}</Text></Pressable>)}</View>;
  const recurrence = !bakery ? <View style={[styles.choiceRow, compact && styles.landscapeRecurrence]}><Pressable onPress={() => onChange({ recurrence: "weekly", ordinal: null })} style={[styles.choicePill, row.recurrence === "weekly" && styles.choicePillSelected]}><Text style={[styles.choiceText, row.recurrence === "weekly" && styles.choiceTextSelected]}>Every week</Text></Pressable><Pressable onPress={() => onChange({ recurrence: "monthly", ordinal: row.ordinal ?? 1 })} style={[styles.choicePill, row.recurrence === "monthly" && styles.choicePillSelected]}><Text style={[styles.choiceText, row.recurrence === "monthly" && styles.choiceTextSelected]}>Once a month</Text></Pressable></View> : null;
  const serviceMode = !bakery ? <View style={compact ? styles.landscapeServiceMode : styles.portraitEditorSection}><Text style={styles.informationLabel}>Receiving method</Text><View style={[styles.choiceRow, styles.serviceModeChoices]}><Pressable onPress={() => onChange({ serviceMode: "staffed" })} style={[styles.choicePill, row.serviceMode === "staffed" && styles.choicePillSelected]}><Text style={[styles.choiceText, row.serviceMode === "staffed" && styles.choiceTextSelected]}>Staffed</Text></Pressable><Pressable onPress={() => onChange({ serviceMode: "unattended" })} style={[styles.choicePill, row.serviceMode === "unattended" && styles.choicePillSelected]}><Text style={[styles.choiceText, row.serviceMode === "unattended" && styles.choiceTextSelected]}>Unattended</Text></Pressable></View></View> : null;
  const fields = <View style={[styles.editorFieldsRow, compact && styles.landscapeTimeFields]}>{!bakery && row.recurrence === "monthly" && <EditorField label="Occurrence" value={String(row.ordinal ?? 1)} onChangeText={(value) => onChange({ ordinal: Number(value) || 1 })} />}{bakery ? <><TimeEditorField label="Business opens" value={row.businessOpen} onChange={(businessOpen) => onChange({ businessOpen })} /><TimeEditorField label="Business closes" value={row.businessClose} onChange={(businessClose) => onChange({ businessClose })} /><TimeEditorField label="Food ready" value={row.readyTime} onChange={(readyTime) => onChange({ readyTime })} /><TimeEditorField label="Pickup deadline" value={row.pickupDeadline} onChange={(pickupDeadline) => onChange({ pickupDeadline })} /></> : <><TimeEditorField label="Opens" value={row.open} onChange={(open) => onChange({ open })} /><TimeEditorField label="Closes" value={row.close} onChange={(close) => onChange({ close })} /><TimeEditorField label="Latest arrival" value={row.latestArrival} onChange={(latestArrival) => onChange({ latestArrival })} /></>}</View>;
  const actions = <View style={[styles.editorActions, compact ? styles.landscapeEditorActions : styles.portraitEditorActions]}><Pressable style={[styles.editorDeleteButton, !compact && styles.portraitEditorAction]} onPress={onDelete}><Text style={styles.editorDeleteButtonText}>Delete window</Text></Pressable>{onCancelDate && <Pressable style={[styles.editorCancelButton, !compact && styles.portraitEditorAction]} onPress={onCancelDate}><Text style={styles.editorCancelButtonText}>Cancel hours on {date}</Text></Pressable>}<Pressable style={[styles.saveAction, compact ? styles.landscapeSaveAction : styles.portraitSaveAction]} onPress={onSave} disabled={busy}><Text style={styles.saveActionText}>{busy ? "Saving…" : "Save changes"}</Text></Pressable></View>;
  if (compact) return <View style={styles.nativeEditor}>{heading}<View style={styles.landscapeFrequencyRow}>{recurrence}</View>{days}<View style={styles.landscapeModeRow}>{serviceMode}</View><View style={styles.landscapeRecurringTimes}>{fields}</View>{actions}</View>;
  return <View style={styles.nativeEditor}>{heading}<View style={styles.portraitEditorSection}>{recurrence}</View><View style={styles.portraitEditorSection}>{days}</View>{serviceMode}<View style={styles.portraitEditorSection}>{fields}</View>{actions}</View>;
}

function OneTimeNativeEditor({ window, bakery, onClose, onSaved }: { window?: MobileWindow; bakery: boolean; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const { width, height } = useWindowDimensions(); const compact = width > height;
  const start = window ? new Date(window.startsAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = window ? new Date(window.endsAt) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const latest = window ? new Date(window.latestArrival) : new Date(end.getTime() - 15 * 60 * 1000);
  const [draft, setDraft] = useState({ date: localDateString(start), starts: localTimeString(start), ends: localTimeString(end), latest: localTimeString(latest), serviceMode: window?.serviceMode ?? "staffed" as "staffed" | "unattended" });
  const [error, setError] = useState("");
  async function save() {
    const startsAt = new Date(`${draft.date}T${draft.starts}:00`).toISOString();
    const endsAt = new Date(`${draft.date}T${draft.ends}:00`).toISOString();
    const latestArrival = bakery ? endsAt : new Date(`${draft.date}T${draft.latest}:00`).toISOString();
    const { response, data } = await workspaceRequest(window ? "PATCH" : "POST", { ...(window ? { id: window.id } : {}), startsAt, endsAt, latestArrival, serviceMode: bakery ? "staffed" : draft.serviceMode });
    if (response.ok) await onSaved(window ? "One-time window updated." : "One-time window created."); else setError(data.error ?? "Could not save window.");
  }
  async function remove() {
    if (!window) return;
    const { response, data } = await workspaceRequest("DELETE", undefined, `?id=${window.id}`);
    if (response.ok) await onSaved("One-time window deleted."); else setError(data.error ?? "Could not delete window.");
  }
  const heading = <View style={styles.editorHeading}><View><Text style={styles.portalPanelKicker}>{window ? "EDIT" : "ADD"} ONE-TIME</Text><Text style={styles.editorTitle}>{window ? formatMobileDate(window.startsAt) : "New window"}</Text></View><Pressable onPress={onClose}><Text style={styles.editorClose}>×</Text></Pressable></View>;
  const fields = <View style={[styles.editorFieldsRow, compact && styles.landscapeTimeFields]}><EditorField label="Date" value={draft.date} onChangeText={(date) => setDraft({ ...draft, date })} /><TimeEditorField label={bakery ? "Food ready" : "Opens"} value={draft.starts} onChange={(starts) => setDraft({ ...draft, starts })} /><TimeEditorField label={bakery ? "Pickup deadline" : "Closes"} value={draft.ends} onChange={(ends) => setDraft({ ...draft, ends })} />{!bakery && <TimeEditorField label="Latest arrival" value={draft.latest} onChange={(latestValue) => setDraft({ ...draft, latest: latestValue })} />}</View>;
  const serviceMode = !bakery ? <View style={compact ? styles.oneTimeServiceLandscape : styles.oneTimeServicePortrait}><Text style={styles.informationLabel}>Receiving method</Text><View style={[styles.choiceRow, styles.serviceModeChoices]}><Pressable onPress={() => setDraft({ ...draft, serviceMode: "staffed" })} style={[styles.choicePill, draft.serviceMode === "staffed" && styles.choicePillSelected]}><Text style={[styles.choiceText, draft.serviceMode === "staffed" && styles.choiceTextSelected]}>Staffed</Text></Pressable><Pressable onPress={() => setDraft({ ...draft, serviceMode: "unattended" })} style={[styles.choicePill, draft.serviceMode === "unattended" && styles.choicePillSelected]}><Text style={[styles.choiceText, draft.serviceMode === "unattended" && styles.choiceTextSelected]}>Unattended</Text></Pressable></View></View> : null;
  const actions = <View style={[styles.editorActions, compact ? styles.landscapeEditorActions : styles.portraitEditorActions]}>{window && <Pressable style={[styles.editorDeleteButton, !compact && styles.portraitEditorAction]} onPress={remove}><Text style={styles.editorDeleteButtonText}>Delete window</Text></Pressable>}<Pressable style={[styles.saveAction, compact ? styles.landscapeSaveAction : styles.portraitSaveAction]} onPress={save}><Text style={styles.saveActionText}>Save window</Text></Pressable></View>;
  if (compact) return <View style={styles.nativeEditor}>{heading}<View style={styles.landscapeEditorBottom}>{fields}</View><View style={styles.oneTimeLandscapeFooter}>{serviceMode}<View style={styles.oneTimeLandscapeActions}>{actions}</View></View>{error ? <Text style={styles.calendarNotice}>{error}</Text> : null}</View>;
  return <View style={styles.nativeEditor}>{heading}{fields}{serviceMode}{error ? <Text style={styles.calendarNotice}>{error}</Text> : null}{actions}</View>;
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
    return <View style={[styles.calendarCell, dateString === localDateString(today) && styles.calendarCellToday]} key={dateString}><Text style={styles.calendarDateNumber}>{date.getDate()}</Text>{exception ? <Pressable style={styles.cancelledCalendarEvent} onPress={() => onRestore(exception.id)}><Text style={styles.calendarEventText}>Cancelled</Text><Text style={styles.calendarEventTime}>Tap to restore</Text></Pressable> : null}{recurring.map(({ row, index }) => <Pressable style={styles.recurringCalendarEvent} key={`r-${index}`} onPress={() => onRecurring(index, dateString)}><Text style={styles.calendarEventText}>Recurring</Text><Text style={styles.calendarEventTime}>{displayClock(bakery ? row.readyTime : row.open)}–{displayClock(bakery ? row.pickupDeadline : row.close)}</Text>{!bakery && <><Text style={styles.calendarEventTime}>Latest {displayClock(row.latestArrival)}</Text><Text style={styles.calendarEventTime}>{row.serviceMode === "unattended" ? "Unattended" : "Staffed"}</Text></>}</Pressable>)}{dated.map((window) => <Pressable style={styles.oneTimeCalendarEvent} key={window.id} onPress={() => onOneTime(window.id)}><Text style={styles.calendarEventText}>{window.paused ? "Paused" : "One-time"}</Text><Text style={styles.calendarEventTime}>{formatMobileTime(window.startsAt)}–{formatMobileTime(window.endsAt)}</Text>{!bakery && <Text style={styles.calendarEventTime}>{window.serviceMode === "unattended" ? "Unattended" : "Staffed"}</Text>}</Pressable>)}</View>;
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

async function submitMobileReport(body: Record<string, unknown>) {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const response = await fetch(`${API_URL}/api/mobile/reports`, { method: "POST", headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Could not send this report.");
  return data;
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
function emptyNativeScheduleRow(): NativeScheduleRow { return { recurrence: "weekly", day: "Mon", ordinal: null, open: "09:00", close: "17:00", latestArrival: "16:30", serviceMode: "staffed", businessOpen: "07:00", businessClose: "18:00", readyTime: "15:00", pickupDeadline: "18:00" }; }
function nativeScheduleRows(workspace: WorkspaceData, bakery: boolean): NativeScheduleRow[] {
  try {
    if (bakery) {
      const ready = JSON.parse(workspace.organization.readyTime ?? "{}") as Record<string, string>;
      const deadlines = JSON.parse(workspace.organization.arrivalDeadline ?? "{}") as Record<string, string>;
      const businessOpen = JSON.parse(workspace.organization.businessOpenTime ?? "{}") as Record<string, string>;
      const businessClose = JSON.parse(workspace.organization.businessCloseTime ?? "{}") as Record<string, string>;
      const rows = Object.keys(ready).map((day) => ({
        ...emptyNativeScheduleRow(),
        day,
        businessOpen: businessOpen[day] ?? ready[day],
        businessClose: businessClose[day] ?? deadlines[day] ?? "18:00",
        readyTime: ready[day],
        pickupDeadline: deadlines[day] ?? "18:00",
      }));
      return rows.length ? rows : [emptyNativeScheduleRow()];
    }
    const opens = JSON.parse(workspace.organization.openTime ?? "[]") as Array<{ day: string; time: string; recurrence?: "weekly" | "monthly"; ordinal?: number | null }>;
    const closes = JSON.parse(workspace.organization.closeTime ?? "[]") as Array<{ time: string }>;
    const latest = JSON.parse(workspace.organization.latestArrival ?? "[]") as Array<{ time: string }>;
    const modes = JSON.parse(workspace.organization.serviceModes ?? "[]") as Array<{ mode: "staffed" | "unattended" }>;
    const rows = opens.map((open, index) => ({ ...emptyNativeScheduleRow(), recurrence: open.recurrence ?? "weekly", day: open.day, ordinal: open.ordinal ?? null, open: open.time, close: closes[index]?.time ?? "17:00", latestArrival: latest[index]?.time ?? "16:30", serviceMode: modes[index]?.mode ?? "staffed" }));
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
      <View style={[styles.photoUploadPanel, !landscape && styles.photoUploadPanelPortrait]}>{photo && <Image source={{ uri: photo.uri }} style={[styles.photoPreview, !landscape && styles.photoPreviewPortrait]} />}<View style={styles.photoUploadControls}><View style={[styles.photoSourceButtons, !landscape && styles.photoSourceButtonsPortrait]}><Pressable style={styles.photoSourceButton} onPress={() => choosePhoto("camera")}><Text style={styles.calendarAddButtonText}>Take photo</Text></Pressable><Pressable style={styles.photoSourceButton} onPress={() => choosePhoto("library")}><Text style={styles.calendarAddButtonText}>Choose photo</Text></Pressable></View><EditorField label="Caption" value={caption} onChangeText={setCaption} /><Pressable style={[styles.addContactButton, !photo && styles.disabledButton]} disabled={!photo} onPress={uploadPhoto}><Text style={styles.saveActionText}>Upload photo</Text></Pressable></View></View>
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

function formatMobileDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time not available";
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
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
  reportProblemCard: { padding: 22, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, gap: 8 },
  mobileReportLabel: { marginTop: 14, color: colors.sage, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  mobileReportChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 4 },
  mobileReportChoice: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: "#FBFAF4" },
  mobileReportChoiceSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  mobileReportChoiceText: { color: colors.forest, fontSize: 9, fontWeight: "800" },
  mobileReportChoiceTextSelected: { color: colors.white },
  mobileSupportCallout: { marginTop: 14, padding: 18, borderRadius: 12, backgroundColor: "#FFF2DC" },
  mobileSupportPhone: { marginTop: 10, color: colors.forest, fontSize: 16, lineHeight: 23, fontWeight: "900", textDecorationLine: "underline" },
  mobileSafetyText: { marginTop: 12, color: "#9C3C2D", fontSize: 10, fontWeight: "700" },
  flex: { flex: 1 },
  portalSafe: { flex: 1, backgroundColor: colors.cream },
  portalShell: { flex: 1 },
  portalLandscape: { flexDirection: "row" },
  portalPortrait: { flexDirection: "column" },
  portalSidebar: { width: 238, flexGrow: 0, flexShrink: 0, backgroundColor: colors.forest, paddingRight: 18, paddingTop: 20, borderRightWidth: 1, borderRightColor: "#315443" },
  portalSidebarScroller: { flex: 1 },
  portalSidebarContent: { flexGrow: 1 },
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
  portalStatusCard: { minHeight: 168, padding: 25, borderRadius: 14, backgroundColor: colors.forest, flexDirection: "row", alignItems: "stretch", gap: 18, overflow: "hidden" },
  portalStatusCardMobile: { flexDirection: "column", alignItems: "stretch", padding: 21 },
  portalStatusCopy: { flex: 1, minWidth: 0 },
  portalStatusLabel: { flexDirection: "row", alignItems: "center", gap: 7 },
  portalStatusHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  portalStatusHeaderActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 7, flexShrink: 1 },
  portalStatusHeaderPrimary: { minHeight: 30, paddingHorizontal: 11, borderRadius: 7, backgroundColor: colors.coral, alignItems: "center", justifyContent: "center" },
  portalStatusHeaderLink: { minHeight: 30, paddingHorizontal: 9, borderRadius: 7, borderWidth: 1, borderColor: "#FFFFFF38", alignItems: "center", justifyContent: "center" },
  portalStatusHeaderActionText: { color: colors.white, fontSize: 8, lineHeight: 11, fontWeight: "900", textAlign: "center" },
  portalStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#76C997" },
  portalStatusDotPaused: { backgroundColor: colors.yellow },
  portalStatusLabelText: { color: "#A9C3B5", fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  portalStatusTitle: { color: colors.white, fontSize: 21, lineHeight: 27, fontWeight: "800", marginTop: 11 },
  portalStatusBody: { color: "#B7CBC0", fontSize: 11, lineHeight: 17, marginTop: 8, maxWidth: 520 },
  portalStatusButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.coral, alignItems: "center", justifyContent: "center" },
  portalStatusActions: { width: 170, maxWidth: "28%", minWidth: 0, flexShrink: 1, gap: 8, justifyContent: "center" },
  portalStatusActionsMobile: { width: "100%", maxWidth: "100%" },
  portalStatusSecondaryButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: "#FFFFFF38", alignItems: "center", justifyContent: "center" },
  portalStatusButtonText: { color: colors.white, fontSize: 9, fontWeight: "900", textAlign: "center" },
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
  photoUploadPanelPortrait: { flexDirection: "column", gap: 10 },
  photoPreview: { width: 120, height: 100, borderRadius: 8, backgroundColor: colors.mint },
  photoPreviewPortrait: { width: "100%", height: 180 },
  photoUploadControls: { flex: 1, gap: 5 },
  photoSourceButtons: { flexDirection: "row", gap: 9, width: "100%" },
  photoSourceButtonsPortrait: { gap: 8 },
  photoSourceButton: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.forest, alignItems: "center", justifyContent: "center" },
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
  landscapeSelectionRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 8 },
  landscapeFrequencyRow: { width: "100%", flexDirection: "row", alignItems: "center", marginBottom: 7 },
  landscapeDetailsRow: { width: "100%", flexDirection: "row", alignItems: "flex-end", gap: 14 },
  landscapeModeRow: { width: "100%", marginTop: 2, marginBottom: 4 },
  landscapeRecurringTimes: { width: "100%", marginTop: 1 },
  landscapeServiceMode: { width: "100%", flexShrink: 0 },
  landscapeDayRow: { width: "100%", flexWrap: "nowrap", marginTop: 0, marginBottom: 8, gap: 7 },
  landscapeDayPill: { flex: 1, minHeight: 36, paddingHorizontal: 8 },
  landscapeRecurrence: { flexWrap: "nowrap", marginBottom: 0, flexShrink: 0 },
  landscapeTimeFields: { flex: 1, flexGrow: 1, flexShrink: 1, minWidth: 0, flexWrap: "nowrap", gap: 10 },
  landscapeEditorActions: { width: "100%", flexDirection: "row", flexWrap: "nowrap", justifyContent: "space-between", marginTop: 10, gap: 9 },
  landscapeSaveAction: { flex: 1, minWidth: 0, marginLeft: 0 },
  editorHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 9 },
  recurringEditorHeading: { marginBottom: 2 },
  editorHeadingCompact: { width: 92, marginBottom: 0, flexShrink: 0 },
  editorTitle: { color: colors.forest, fontSize: 17, fontWeight: "900", marginTop: 4 },
  editorClose: { color: colors.forest, fontSize: 27, lineHeight: 28 },
  editorChoices: {},
  editorChoicesCompact: { width: 200, flexShrink: 0 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  serviceModeChoices: { marginTop: 5, marginBottom: 0 },
  oneTimeServicePortrait: { marginTop: 13, marginBottom: 8 },
  oneTimeServiceLandscape: { width: 220, flexShrink: 0 },
  oneTimeLandscapeFooter: { width: "100%", flexDirection: "row", alignItems: "flex-end", gap: 14, marginTop: 9 },
  oneTimeLandscapeActions: { flex: 1, minWidth: 0 },
  choicePill: { minHeight: 31, paddingHorizontal: 10, borderRadius: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  choicePillSelected: { backgroundColor: colors.forest, borderColor: colors.forest },
  choiceText: { color: colors.forestSoft, fontSize: 8, fontWeight: "900" },
  choiceTextSelected: { color: colors.white },
  editorFieldsRow: { flexDirection: "row", flexWrap: "wrap", gap: 9, flex: 1 },
  editorField: { flexGrow: 1, flexShrink: 1, flexBasis: 86, minWidth: 0, marginTop: 5 },
  editorInput: { minHeight: 39, marginTop: 4, paddingHorizontal: 10, color: colors.forest, fontSize: 11, fontWeight: "700", backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  editorActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 11 },
  portraitEditorSection: { marginTop: 6, marginBottom: 6 },
  portraitEditorActions: { width: "100%", alignItems: "stretch", gap: 9 },
  portraitEditorAction: { flexGrow: 1, flexBasis: "46%", minWidth: 0 },
  portraitSaveAction: { width: "100%", marginLeft: 0 },
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
  deleteAccountLink: { marginTop: 22, color: "#A34231", fontSize: 10, fontWeight: "900", textDecorationLine: "underline" },
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
  driverPageTitle: { color: colors.forest, fontSize: 28, lineHeight: 34, fontWeight: "900", letterSpacing: -0.7, marginTop: 5, marginBottom: 9 },
  driverFeedHeading: { marginTop: 24, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  driverSearchShortcut: { minHeight: 39, paddingHorizontal: 18, borderRadius: 8, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" },
  driverSearchShortcutText: { color: colors.white, fontSize: 9, fontWeight: "900" },
  driverSearchError: { marginTop: 14, marginBottom: -4 },
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
  pickupReadyBanner: { marginTop: 12, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 8, backgroundColor: "#E8F4EA", borderWidth: 1, borderColor: "#9FC7A8" },
  pickupReadyBannerText: { color: colors.forest, fontSize: 9, fontWeight: "900" },
  unattendedDropoffBanner: { marginTop: 12, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 8, backgroundColor: "#FFF3D6", borderWidth: 1, borderColor: "#E6BD55" },
  unattendedDropoffTitle: { color: colors.forest, fontSize: 10, fontWeight: "900" },
  unattendedDropoffBody: { marginTop: 4, color: colors.forestSoft, fontSize: 9, lineHeight: 14 },
  driverReserveButton: { minHeight: 41, marginTop: 14, borderRadius: 8, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" },
  driverReserveButtonText: { color: colors.white, fontSize: 9, fontWeight: "900" },
  driverSearchCard: { marginTop: 18, padding: 17, borderRadius: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  savedRequestList: { marginTop: 20, gap: 10 },
  savedRequestCard: { padding: 16, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  liveOfferCard: { borderColor: colors.yellow, borderWidth: 2 },
  offerActions: { marginTop: 16, flexDirection: "row", alignItems: "stretch", gap: 10 },
  offerDeclineButton: { flex: 1, minHeight: 44, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  offerReserveButton: { flex: 1, minHeight: 44, marginTop: 0, paddingHorizontal: 8 },
  routeDirectionActions: { marginTop: 15, gap: 9 },
  primaryDirectionButton: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.forest },
  primaryDirectionAfterProgress: { marginTop: 10 },
  secondaryDirectionButton: { minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.forest, backgroundColor: colors.paper },
  secondaryDirectionText: { color: colors.forest, fontSize: 9, fontWeight: "900" },
  activeDestination: { marginTop: 17, paddingTop: 17, borderTopWidth: 1, borderTopColor: colors.border },
  activeDestinationName: { marginTop: 5, color: colors.forest, fontSize: 22, lineHeight: 27, fontWeight: "900" },
  activeDestinationAddress: { marginTop: 5, marginBottom: 13, color: colors.forestSoft, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  arrivalDetailsToggle: { minHeight: 42, marginTop: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper },
  arrivalDetails: { marginTop: 11, padding: 13, borderRadius: 10, backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.border },
  arrivalDetailsExpanded: { padding: 17, borderColor: colors.yellow, backgroundColor: "#FFF8E6" },
  arrivalDetailsHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  arrivalDetailsClose: { color: colors.forest, fontSize: 22, fontWeight: "700" },
  arrivalInstructionsExpanded: { marginTop: 8, color: colors.forest, fontSize: 12, lineHeight: 18 },
  arrivalPhotoRow: { gap: 10, paddingTop: 12, paddingRight: 10 },
  arrivalPhotoCard: { width: 150 },
  arrivalPhotoCardExpanded: { width: 225 },
  arrivalPhoto: { width: 150, height: 100, borderRadius: 8, backgroundColor: colors.border },
  arrivalPhotoExpanded: { width: 225, height: 155 },
  arrivalPhotoCaption: { marginTop: 6, color: colors.forestSoft, fontSize: 8, lineHeight: 12 },
  arrivalNoPhotos: { marginTop: 10, color: colors.sage, fontSize: 9, fontStyle: "italic" },
  routeProgressButton: { minHeight: 48, marginTop: 12, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.coral },
  routeSecondaryDestination: { marginTop: 14, padding: 13, borderRadius: 9, backgroundColor: colors.mint },
  completedRouteSummary: { marginTop: 15, padding: 14, borderRadius: 10, backgroundColor: "#E8F4EA", borderWidth: 1, borderColor: "#9FC7A8" },
  offerDeclineText: { color: colors.coral, fontSize: 9, fontWeight: "900" },
  driverNotificationCard: { marginTop: 12, padding: 17, borderRadius: 12, backgroundColor: "#FFF5D8", borderWidth: 1, borderColor: "#E7CA77" },
  nativeNotificationButton: { alignSelf: "flex-start", marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.forest },
  nativeAcknowledged: { marginTop: 10, color: colors.forestSoft, fontSize: 9, fontWeight: "900" },
  nativePickupConfirmation: { marginBottom: 14, padding: 18, borderRadius: 13, backgroundColor: "#FFF5D8", borderWidth: 1, borderColor: "#E7CA77" },
  nativePickupConfirmed: { backgroundColor: "#E8F4EA", borderColor: "#9FC7A8" },
  nativePickupUnavailable: { backgroundColor: colors.paper, borderColor: colors.border },
  nativePickupStatusControls: { marginTop: 15, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#FFFFFF24" },
  pickupWindowBeingConfirmed: { marginBottom: 11 },
  pickupWindowBeingConfirmedText: { marginTop: 4, color: colors.white, fontSize: 10, lineHeight: 15, fontWeight: "900" },
  nativePickupActions: { marginTop: 13, flexDirection: "row", alignItems: "stretch", flexWrap: "wrap", gap: 9 },
  nativePickupChoice: { minHeight: 40, minWidth: 128, flexGrow: 1, flexBasis: 128, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#FFFFFF38", alignItems: "center", justifyContent: "center" },
  nativeConfirmPickup: { backgroundColor: colors.forest },
  statusCardLink: { color: "#D6E5DC", fontSize: 9, fontWeight: "900" },
  statusNotificationMobile: { marginTop: 15, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#FFFFFF24" },
  statusNotificationTitle: { color: colors.white, fontSize: 12, fontWeight: "900", marginTop: 5 },
  statusNotificationBody: { color: "#B7CBC0", fontSize: 9, lineHeight: 14, marginTop: 4 },
  statusNotificationButton: { backgroundColor: colors.coral, flexShrink: 1, maxWidth: "100%" },
  notificationActionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 9 },
  notificationActionRowCompact: { marginTop: 16, paddingTop: 2 },
  notificationSecondaryButton: { marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: "#FFFFFF38", flexShrink: 1, maxWidth: "100%" },
  deliveryHelpButton: { minHeight: 42, marginTop: 18, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper },
  deliveryHelpPanel: { marginTop: 9, padding: 13, gap: 8, borderRadius: 10, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  deliveryHelpQuestion: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  deliveryHelpQuestionText: { color: colors.forest, fontSize: 10, lineHeight: 15, fontWeight: "900" },
  deliveryHelpAnswer: { marginTop: 6, color: colors.forestSoft, fontSize: 9, lineHeight: 14 },
  deliveryHelpImmediate: { marginTop: 8, color: colors.forest, fontSize: 10, fontWeight: "900" },
  cancelDeliveryButton: { alignSelf: "flex-start", marginTop: 24, paddingVertical: 8, paddingHorizontal: 4 },
  deliveryProofImage: { width: 150, height: 105, marginTop: 10, borderRadius: 9, backgroundColor: colors.border },
  driverSearchTimeRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  locationPreferenceButton: { minHeight: 42, marginBottom: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.forest, alignItems: "center", justifyContent: "center" },
  locationPreferenceText: { color: colors.forest, fontSize: 9, fontWeight: "900" },
  previewResults: { marginTop: 18 },
  driverEmptyCard: { minHeight: 210, marginTop: 18, padding: 22, borderRadius: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, alignItems: "flex-start", justifyContent: "center" },
  driverProfileCard: { marginTop: 15, marginBottom: 20, padding: 17, borderRadius: 13, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  privateProfileNote: { color: colors.sage, fontSize: 9, lineHeight: 14, marginBottom: 12 },
  birthDateGroup: { marginBottom: 13 },
  birthDateButton: { minHeight: 49, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.paper },
  birthDateValue: { color: colors.forest, fontSize: 12, fontWeight: "800" },
  birthDatePlaceholder: { color: colors.sage, fontWeight: "600" },
  birthDateIcon: { color: colors.forestSoft, fontSize: 16 },
  birthDateHelp: { marginTop: 6, color: colors.sage, fontSize: 8, lineHeight: 12 },
  datePickerBackdrop: { flex: 1, padding: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#092D24AA" },
  datePickerCard: { width: "100%", maxWidth: 410, padding: 20, borderRadius: 16, backgroundColor: colors.paper },
  datePickerTitle: { marginTop: 5, color: colors.forest, fontSize: 22, fontWeight: "900" },
  datePickerDone: { minHeight: 44, marginTop: 8, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.forest },
  impactSummary: { marginTop: 18, flexDirection: "row", gap: 10 },
  impactMetric: { flex: 1, minHeight: 112, padding: 17, justifyContent: "center", borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper },
  impactMetricValue: { color: colors.forest, fontSize: 30, lineHeight: 34, fontWeight: "900" },
  impactMetricLabel: { marginTop: 6, color: colors.sage, fontSize: 9, lineHeight: 13, fontWeight: "800" },
  impactSectionTitle: { marginTop: 25, marginBottom: 11, color: colors.forest, fontSize: 18, fontWeight: "900" },
  badgeGrid: { gap: 10 },
  badgeCard: { minHeight: 84, padding: 14, flexDirection: "row", alignItems: "center", gap: 13, borderRadius: 13, borderWidth: 1, borderColor: "#9FC7A8", backgroundColor: "#E8F4EA" },
  badgeCardLocked: { borderColor: colors.border, backgroundColor: colors.paper, opacity: 0.72 },
  badgeIcon: { width: 50, height: 50, alignItems: "center", justifyContent: "center", borderRadius: 25, backgroundColor: colors.forest },
  badgeIconLocked: { backgroundColor: colors.mint },
  badgeIconText: { color: colors.white, fontSize: 18, fontWeight: "900" },
  badgeCopy: { flex: 1 },
  badgeTitle: { color: colors.forest, fontSize: 13, fontWeight: "900" },
  badgeDetail: { marginTop: 4, color: colors.sage, fontSize: 9, lineHeight: 13 },
  connectedCard: { marginTop: 12, padding: 20, borderRadius: 14, backgroundColor: colors.mint, borderWidth: 1, borderColor: colors.border },
  connectedTitle: { color: colors.forest, fontWeight: "900", fontSize: 17, marginBottom: 8 },
  connectedBody: { color: colors.forestSoft, marginTop: 4 },
  driverVerificationCard: { marginTop: 14, padding: 20, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  driverVerificationHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  verificationHeadingCopy: { flex: 1 },
  verificationStatusDot: { width: 12, height: 12, marginTop: 5, borderRadius: 6, backgroundColor: colors.yellow },
  verificationStatusDotVerified: { backgroundColor: "#56C78A" },
  identityActionButton: { minHeight: 44, marginTop: 15, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.forest },
  identityPrivacyNote: { marginTop: 10, color: colors.sage, fontSize: 8, lineHeight: 12 },
  errorText: { color: "#A34436", fontWeight: "700", marginBottom: 10 },
  welcomeScroll: { flexGrow: 1, paddingTop: 14 },
  brandRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 24, gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 19, borderBottomLeftRadius: 6, backgroundColor: colors.coral, alignItems: "center", justifyContent: "center" },
  brandLetter: { color: colors.white, fontSize: 19, fontWeight: "900" },
  brandNameLight: { color: colors.white, fontSize: 20, fontWeight: "800", letterSpacing: -0.6 },
  hero: { paddingHorizontal: 25, paddingTop: 54, paddingBottom: 45 },
  heroTitle: { color: colors.white, fontSize: 42, lineHeight: 46, letterSpacing: -1.4, fontWeight: "700" },
  heroBody: { color: "#B7CBC0", fontSize: 15, lineHeight: 23, marginTop: 18, maxWidth: 350 },
  learnButton: { alignSelf: "flex-start", minHeight: 46, marginTop: 25, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 23, borderWidth: 1, borderColor: "#7EA08F", backgroundColor: "#FFFFFF0D" },
  learnButtonText: { color: colors.white, fontSize: 11, fontWeight: "900" },
  learnButtonArrow: { color: colors.yellow, fontSize: 24, lineHeight: 24 },
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
  learnSafe: { flex: 1, backgroundColor: colors.forest },
  learnHeader: { minHeight: 64, paddingHorizontal: 18, flexDirection: "row", alignItems: "center" },
  learnHeaderBack: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, borderWidth: 1, borderColor: colors.forestSoft },
  learnHeaderBackText: { color: colors.white, fontSize: 31, lineHeight: 32, marginTop: -3 },
  learnBrand: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  learnBrandText: { color: colors.white, fontSize: 16, fontWeight: "900" },
  learnHeaderSpacer: { width: 40 },
  learnScroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 22, paddingTop: 20, paddingBottom: 28 },
  learnCard: { width: "100%", maxWidth: 560, minHeight: 390, alignSelf: "center", justifyContent: "center", padding: 28, borderRadius: 26, backgroundColor: colors.cream },
  learnIconBubble: { width: 68, height: 68, marginBottom: 22, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: colors.mint },
  learnIcon: { fontSize: 32 },
  learnKicker: { color: colors.coral, fontSize: 9, letterSpacing: 1.7, fontWeight: "900", marginBottom: 10 },
  learnStat: { color: colors.forest, fontSize: 64, lineHeight: 68, fontWeight: "900", letterSpacing: -2.5 },
  learnTitle: { maxWidth: 430, color: colors.forest, fontSize: 30, lineHeight: 35, fontWeight: "900", letterSpacing: -0.8 },
  learnBody: { maxWidth: 430, marginTop: 15, color: colors.sage, fontSize: 14, lineHeight: 21 },
  learnProcess: { marginTop: 25, gap: 18 },
  learnProcessRow: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  learnNumber: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: colors.coral },
  learnNumberText: { color: colors.white, fontSize: 13, fontWeight: "900" },
  learnProcessCopy: { flex: 1, paddingTop: 1 },
  learnProcessTitle: { color: colors.forest, fontSize: 15, fontWeight: "900" },
  learnProcessBody: { marginTop: 3, color: colors.sage, fontSize: 11, lineHeight: 16 },
  learnDots: { marginVertical: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  learnDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.forestSoft },
  learnDotActive: { width: 23, backgroundColor: colors.yellow },
  learnPrimaryButton: { width: "100%", maxWidth: 560, minHeight: 52, alignSelf: "center", alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.coral },
  learnPrimaryButtonText: { color: colors.white, fontSize: 12, fontWeight: "900" },
  learnSecondaryButton: { width: "100%", maxWidth: 560, minHeight: 48, marginTop: 10, alignSelf: "center", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: colors.forestSoft },
  learnSecondaryButtonText: { color: colors.white, fontSize: 11, fontWeight: "900" },
  learnSourceLink: { marginTop: 17, color: "#A9C2B5", textAlign: "center", fontSize: 9, textDecorationLine: "underline" },
  sourceModalBackdrop: { flex: 1, padding: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#0C241BCF" },
  sourceModalCard: { width: "100%", maxWidth: 560, maxHeight: "90%", padding: 24, borderRadius: 24, backgroundColor: colors.cream },
  sourceModalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  sourceModalTitle: { color: colors.forest, fontSize: 25, lineHeight: 30, fontWeight: "900", letterSpacing: -0.6 },
  sourceModalClose: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  sourceModalCloseText: { color: colors.forest, fontSize: 28, lineHeight: 30 },
  sourceItem: { marginTop: 19, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border },
  sourceYear: { color: colors.coral, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  sourceStat: { marginTop: 5, color: colors.forest, fontSize: 35, lineHeight: 40, fontWeight: "900" },
  sourceBody: { marginTop: 5, color: colors.sage, fontSize: 11, lineHeight: 17 },
  sourceArticleLink: { marginTop: 10, color: colors.forest, fontSize: 10, fontWeight: "900", textDecorationLine: "underline" },
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
  legalLinks: { flexDirection: "row", justifyContent: "center", gap: 22, marginBottom: 2 },
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
  impactShareMobile: { marginTop: 22, paddingTop: 22, borderTopWidth: 1, borderTopColor: colors.border },
  impactRouteChoices: { gap: 8, marginBottom: 14 },
  impactRouteChoice: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 12, backgroundColor: colors.paper },
  impactRouteChoiceSelected: { borderColor: colors.forest, backgroundColor: colors.mint },
  impactRouteText: { color: colors.forest, fontSize: 11, fontWeight: "800" },
  impactRouteTextSelected: { color: colors.forest },
  impactPhotoPreview: { width: "100%", height: 190, marginBottom: 12, borderRadius: 10, backgroundColor: colors.mint },
  impactConsentMobile: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 14, marginBottom: 6 },
  impactConsentBox: { width: 22, height: 22, borderWidth: 1, borderColor: colors.border, borderRadius: 5, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper },
  impactConsentBoxChecked: { backgroundColor: colors.forest, borderColor: colors.forest },
  impactConsentCheck: { color: colors.white, fontWeight: "900" },
  impactConsentText: { flex: 1, color: colors.sage, fontSize: 10, lineHeight: 15 },
  centerText: { textAlign: "center" },
});
