PRIVACY POLICY

Last updated: 23 November 2025

Overview
--------
This privacy notice explains how the Niyati application ("Niyati", "we", "us") collects, stores, and uses personal information you provide when using the app. Niyati is primarily a client-side application: personal profile data and chat history are stored locally on your device unless you explicitly opt into features that use remote services. This document describes what is stored, why it is stored, when (and only if) we may call external services, and how you can manage or delete your data.

Scope
-----
- This policy applies to the Niyati application and to any optional server-side features that are clearly indicated in the app interface (for example, optional astrology provider lookups or geocoding services).
- Data processed only on your device (localStorage) remains under your control; external processing requires explicit consent.

Data We Collect
----------------
The following categories of data may be collected and stored by the app:

- Phone number: used as a session identifier to persist and restore your conversation on the same device. Stored locally in `localStorage` under the app's keys.
- Profile fields: name, date of birth (DoB), place of birth, and current location. These may be captured directly by you in the profile form or extracted tentatively from your chat messages by the app. Extracted fields are stored as tentative values until you explicitly confirm them.
- Chat history: messages you exchange with the app to maintain conversational context and continuity.

How We Use Your Data
---------------------
Your data is used only for the operation of the app and to provide the features you interact with. Typical uses include:

- Generating personalized astrological and numerological insights based on your profile and chat history.
- Restoring your conversation and profile on the same device.
- Improving the local user experience (for example, pre-filling fields you previously confirmed).

Local Storage and Retention
---------------------------
- By default, Niyati stores personal data locally in your browser's `localStorage` (or equivalent local device storage). This means your data remains on your device and is not uploaded to external servers unless you grant consent for a specific feature that requires it.
- Clearing your browser/app data or using the app's "Logout / Reset" button will remove locally stored personal data (phone number, profile, chat history).

Optional Server-Side or Third-Party Processing
---------------------------------------------
Some optional features may use external services to improve accuracy or provide functionality (examples: geocoding a place-of-birth to its country or lat/lng, calling a third-party astrology provider for advanced calculations). These optional flows follow these rules:

- Explicit Consent: the app will ask for your explicit consent before sending profile fields or place-of-birth text to any third-party service.
- Server-Side Proxy: when an external API is used, the app will call our server-side proxy (not the third-party endpoint directly). API keys and credentials are kept only on the server. You can inspect which services will be used in the UI before consenting.
- Minimal Data: we only send the data strictly required by the third-party to perform the requested task (for example, a place name for geocoding). We will not send your full chat history without separate, explicit consent.
- Examples of optional services: OpenCage, Google Geocoding, or an external astrology provider. Use of any of these requires prior consent and will be documented in the UI flow.

Geocoding & Place-Of-Birth Handling
----------------------------------
- For some astrology calculations we may require a structured place-of-birth (city and country or lat/lng). The app first attempts privacy-preserving local matching (local DB) where available.
- If local matching is insufficient and you consent, the app may send the place-of-birth text to a server-side geocoding proxy which calls an external provider (e.g., OpenCage or Google) to disambiguate the place and return structured data (city, country, ISO country code, lat/lng).
- You can always decline external geocoding; when declined the app will prompt you to manually select a country or confirm the place before using it for calculations.

Consent and Legal Basis
-----------------------
- Consent: by checking the consent box on the login screen and continuing, you explicitly consent to the collection and local storage of your profile data on your device for the operation of Niyati.
- Additional Consent: where a feature requires external processing or data sharing with a third-party service (geocoding, astrology providers), the app will request separate, explicit consent before performing that action.

Using and Confirming Extracted Profile Fields
---------------------------------------------
- Fields that the app extracts from chat messages (name, DoB, place-of-birth) are stored as tentative values and marked as unverified. The UI surfaces these tentative values for your review.
- You must explicitly confirm (verify) extracted fields before they are used for any external API calls or for final astrology computations.

Failure Handling and Fallbacks
-----------------------------
- If an external service call fails (network error, rate limit, provider error), the app will not block you. Instead, it will:
	- Offer a local fallback (suggested country list or local DB matches) when available, or
	- Prompt you to select/confirm the country manually, and record that `needsGeocode=true` so the field is not used until resolved.
- The app implements retry/backoff for transient network errors but will not retry indefinitely. Caching is used to reduce repeated calls for the same place strings.

Security
--------
- The data stored locally is subject to the security of your device and browser. We do not have access to your local storage by default.
- When external services are used, API keys are kept on the server-side proxy; keys are not embedded in client bundles.
- We take reasonable measures on the server side (where applicable) to protect stored data in transit and at rest, but note that the primary storage for user profile data in this app is local to your device.

Data Sharing & Third Parties
---------------------------
- We do not sell, rent, or trade your personal information for marketing purposes.
- Third-party services may be used for optional features (with consent). When used, we attempt to minimize the data shared and only send what is necessary for the requested function.

Children's Privacy
------------------
- Niyati is not intended for use by children under 13. We do not knowingly collect personal information from children. If you believe we have inadvertently collected data from a child, please contact us and we will remove it.

How to Delete or Export Your Data
---------------------------------
- Delete locally: use the app's "Logout / Reset" button to clear phone number, profile, and chat history stored on the device.
- Export or removal requests: if you need assistance or a guided removal process, open an issue in the project's repository or use the contact details in the README. Be aware that since data is stored locally, we cannot delete data on your device remotely unless you provide it to us (for example, by sharing storage files). We will provide guidance on safe deletion.

Changes to this Policy
----------------------
- We may update this policy from time to time. The "Last updated" date at the top reflects the most recent change. When significant changes are made that affect how personal data is processed, we will indicate this in the app UI and request renewed consent where appropriate.

Contact
-------
If you have questions about this policy, privacy concerns, or need help deleting or exporting your data, please submit an issue in the project's repository or contact the maintainer listed in the project README.

Acknowledgement and Consent
---------------------------
By using Niyati and checking the consent box on the login screen, you acknowledge that you have read this privacy policy and consent to the collection and local processing of your data as described above. For any optional external processing (geocoding, astrology provider calls), you will be asked for separate consent at the time the feature is used.
