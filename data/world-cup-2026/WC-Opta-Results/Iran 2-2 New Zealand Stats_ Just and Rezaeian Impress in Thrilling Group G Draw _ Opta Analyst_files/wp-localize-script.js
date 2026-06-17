// Carrier file for `wp_localize_script` that publishes the `window.sdapi`
// global. Also primes the SDAPI session cookie when the page actually
// renders SDAPI blocks so block view.js fetches don't each trip 401 → /session
// → retry on first visit.
//
// Skipped when the non-httpOnly `STYXKEY_sdapi_session_present` companion cookie
// is readable — that means the visitor likely already has a valid session, and
// any rare staleness is handled by sdapiFetch's existing 401-retry path.
( function () {
	if ( typeof window === 'undefined' || ! window.sdapi ) {
		return;
	}
	if ( window.__sdapiSessionPromise ) {
		return;
	}
	if ( ! document.querySelector( '[class*="wp-block-sdapi-blocks-"]' ) ) {
		return;
	}
	if (
		( '; ' + document.cookie ).indexOf( '; STYXKEY_sdapi_session_present=' ) !== -1
	) {
		return;
	}
	window.__sdapiSessionPromise = fetch(
		new URL(
			'wp-json/' + window.sdapi.api_base + '/session',
			window.location.origin
		).href,
		{ credentials: 'same-origin', cache: 'no-store' }
	).catch( function () {
		// Don't memoize a failure — sdapiFetch will retry on its own 401.
		window.__sdapiSessionPromise = null;
	} );
} )();
