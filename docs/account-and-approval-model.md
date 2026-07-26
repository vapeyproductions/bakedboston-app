# BakedBoston account and approval model

## One app, four workspaces

The native app has one downloadable binary. After opening it, a user chooses
their role:

- Driver
- Bakery
- Pantry

The administrator workspace remains web-first because it contains sensitive
approval, data-management, and system oversight tools.

## Account rules

### Drivers

Drivers may create their own accounts. A driver profile begins in `pending`
until the email or phone is verified, then becomes `active`. It may later be
`suspended` by an administrator.

### Bakeries and pantries

A bakery or pantry user may not create an active organization account directly.
They either:

1. sign in to an account already linked to an approved organization, or
2. submit a partner-access request.

An administrator reviews the request and either links the requester to an
existing organization or approves a new organization. Approval creates an
organization membership and sends the user an account-setup invitation.

## Core records

### User

- id
- email
- password hash or external authentication id
- display name
- phone
- account status: `pending`, `active`, or `suspended`
- created and updated timestamps

### Driver profile

- user id
- home ZIP code
- onboarding status
- willingness/preferences (future optimization input)

### Organization

- type: `bakery` or `pantry`
- link to the operational bakery/pantry record
- approval status: `pending`, `approved`, `declined`, or `suspended`
- approved/reviewed by and timestamp

### Organization membership

- user id
- organization id
- role: `owner` or `staff`
- status

### Partner access request

- requested organization type and name
- address
- requester contact details
- notes
- status: `pending`, `approved`, or `declined`
- administrator review metadata

## Permission boundary

The selected role changes navigation only. Every API request must check the
authenticated user's server-side account and organization membership.

- Drivers can see and act on eligible rescue routes.
- Bakery members can change only their bakery's availability and pickups.
- Pantry members can change only their pantry's receiving schedule and view
  relevant deliveries.
- Administrators can approve organizations, manage all operational records,
  and oversee all routes.

## First backend milestone

1. Add authentication and secure sessions.
2. Add the account, organization, membership, and access-request tables.
3. Connect driver registration to the API.
4. Connect partner login and access requests to the API.
5. Add the administrator approval queue.

The current native screens intentionally stop before pretending an account was
created. Until this backend milestone is complete, they are a tested interface
prototype and product-flow specification.
