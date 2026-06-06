(function() {
    'use strict';

    // â”€â”€ Configuration 
    const S3_CONFIG_URL = 'https://tmsi.akamaized.net/js/ad-setup/prebid/config/com.json';
    const DEMO_MODE = false;
    const CONFIG_URL = S3_CONFIG_URL;
    const VIEWPORT_MARGIN_PX = 500;

    // â”€â”€ Globals
    window.pbjs = window.pbjs || {};
    window.pbjs.que = window.pbjs.que || [];
    var pbjs = window.pbjs;
    window.googletag = window.googletag || { cmd: [] };
    window._gptSlots = {};
    window._prebidRefreshedSlots = {};
    window.prebidConfig = null;
    window.prebidAdUnits = [];
    window.prebidReady = false;
    window.onPrebidReady = window.onPrebidReady || null;
    window.prebidRefreshSlots = null;

    var _prebidViewportObserver = null;

    // â”€â”€ Content Group Targeting
    // Maps tmAnalytics properties to GAM targeting keys:
    //   prop2 -> cg1 (contentgroup1)
    //   prop3 -> cg2 (contentgroup2)
    //   prop4 -> cg3 (contentgroup3)
    //   prop5 -> cg4 (contentgroup4)

    var _cgMap = { prop2: 'cg1', prop3: 'cg2', prop4: 'cg3', prop5: 'cg4' };
    var _cgApplied = false;
    var _cgPollTimer = null;
    var CG_POLL_INTERVAL = 200;
    var CG_POLL_TIMEOUT = 5000;

    function applyContentGroupTargeting() {
        if (_cgApplied) return true;

        var props = Object.keys(_cgMap);
        var found = 0;

        for (var i = 0; i < props.length; i++) {
            var prop = props[i];
            try {
                var val = window.tmAnalytics &&
                          window.tmAnalytics.properties &&
                          window.tmAnalytics.properties[prop];
                if (val != null) {
                    googletag.pubads().setTargeting(_cgMap[prop], [String(val)]);
                    console.log('[Prebid] Set content group targeting:', _cgMap[prop], '=', val);
                    found++;
                }
            } catch (e) {
                console.warn('[Prebid] Could not read tmAnalytics.' + prop, e);
            }
        }

        if (found > 0) {
            _cgApplied = true;
            if (_cgPollTimer) {
                clearTimeout(_cgPollTimer);
                _cgPollTimer = null;
            }
            return true;
        }

        return false;
    }

    function startContentGroupPolling() {
        if (_cgApplied) return;

        var elapsed = 0;

        function poll() {
            if (_cgApplied) return;

            var applied = applyContentGroupTargeting();
            if (applied) {
                console.log('[Prebid] Content group targeting applied via polling');
                return;
            }

            elapsed += CG_POLL_INTERVAL;
            if (elapsed >= CG_POLL_TIMEOUT) {
                console.warn('[Prebid] tmAnalytics not available after ' + CG_POLL_TIMEOUT + 'ms, content group targeting skipped');
                return;
            }

            _cgPollTimer = setTimeout(poll, CG_POLL_INTERVAL);
        }

        _cgPollTimer = setTimeout(poll, CG_POLL_INTERVAL);
    }


    // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Map full ad unit code to short div ID
    // "/58778164/transfermarkt.com/transfermarkt.com_d_side_1" -> "d_side_1"
    function getShortDivId(adUnitCode) {
        var match = adUnitCode.match(/transfermarkt\.com_(.+)$/);
        return match ? match[1] : adUnitCode;
    }

    // Resolve mediaTypes from reference (e.g., "banner.d_top_1" -> { banner: { sizes: [...] } })
    function resolveMediaTypes(mediaTypesRef, config) {
        if (!mediaTypesRef || !config.mediaTypes) {
            return null;
        }

        var parts = mediaTypesRef.split('.');
        if (parts.length !== 2) {
            console.warn('[Prebid] Invalid mediaTypesRef format:', mediaTypesRef);
            return null;
        }

        var type = parts[0];
        var preset = parts[1];
        var presetConfig = config.mediaTypes[type] && config.mediaTypes[type][preset];

        if (!presetConfig) {
            console.warn('[Prebid] MediaTypes preset not found:', mediaTypesRef);
            return null;
        }

        if (type === 'banner') {
            return { banner: { sizes: presetConfig.sizes } };
        } else if (type === 'video') {
            return { video: Object.assign({}, presetConfig) };
        } else if (type === 'native') {
            return { native: Object.assign({}, presetConfig) };
        }

        return null;
    }

    // Resolve bidder params from reference
    function resolveBidderParams(paramsRef, config) {
        if (!paramsRef || !config.bidderParams) {
            return null;
        }

        var parts = paramsRef.split('.');
        if (parts.length !== 2) {
            return null;
        }

        var bidderName = parts[0];
        var presetName = parts[1];
        return (config.bidderParams[bidderName] && config.bidderParams[bidderName][presetName]) || null;
    }

    // Build prebid ad units from config
    function buildAdUnits(config) {
        if (!config.adUnits || !Array.isArray(config.adUnits)) {
            console.error('[Prebid] No adUnits found in config');
            return [];
        }

        return config.adUnits.map(function(unit) {
            var adUnit = {
                code: unit.code,
                bids: []
            };

            // Resolve mediaTypes
            if (unit.mediaTypesRef) {
                adUnit.mediaTypes = resolveMediaTypes(unit.mediaTypesRef, config);
            } else if (unit.mediaTypes) {
                adUnit.mediaTypes = unit.mediaTypes;
            }

            // Process bids
            if (unit.bids && Array.isArray(unit.bids)) {
                adUnit.bids = unit.bids.map(function(bid) {
                    var processedBid = { bidder: bid.bidder };

                    if (bid.paramsRef) {
                        processedBid.params = resolveBidderParams(bid.paramsRef, config);
                    } else if (bid.params) {
                        processedBid.params = bid.params;
                    }

                    return processedBid;
                }).filter(function(bid) { return bid.params; });
            }

            return adUnit;
        });
    }

    // â”€â”€ GPT Slot Management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Load GPT library if not already present
    function loadGPT() {
        return new Promise(function(resolve, reject) {
            if (window.googletag && window.googletag.apiReady) {
                console.log('[Prebid] GPT already loaded');
                resolve();
                return;
            }
            console.log('[Prebid] Loading GPT library...');
            var script = document.createElement('script');
            script.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
            script.async = true;
            script.onload = function() {
                console.log('[Prebid] GPT library loaded');
                resolve();
            };
            script.onerror = function() {
                console.error('[Prebid] Failed to load GPT library');
                reject(new Error('GPT failed to load'));
            };
            document.head.appendChild(script);
        });
    }

    // Define GPT slots from config ad units
    function defineGPTSlots(config) {
        return new Promise(function(resolve) {
            googletag.cmd.push(function() {
                console.log('[Prebid] Defining GPT slots...');

                var adUnits = config.adUnits || [];
                var mediaTypes = config.mediaTypes || {};

                adUnits.forEach(function(unit) {
                    var adUnitPath = unit.code;
                    var shortId = getShortDivId(adUnitPath);
                    var element = document.getElementById(shortId);

                    var isValidUnit = shortId.startsWith('d_') || shortId.startsWith('m_');
                    if (!element || !isValidUnit) {
                        return;
                    }

                    // Resolve sizes from mediaTypesRef
                    var sizes = [];
                    if (unit.mediaTypesRef) {
                        var parts = unit.mediaTypesRef.split('.');
                        if (parts.length === 2) {
                            var type = parts[0];
                            var preset = parts[1];
                            var presetConfig = mediaTypes[type] && mediaTypes[type][preset];
                            if (presetConfig && presetConfig.sizes) {
                                sizes = presetConfig.sizes;
                            }
                        }
                    }

                    // Add fluid to specific slots
                    var fluidSlots = ['d_top_1', 'd_bottom_1', 'd_side_1', 'd_side_2'];
                    if (fluidSlots.indexOf(shortId) !== -1) {
                        sizes = sizes.concat(['fluid']);
                    }

                    var slot = googletag.defineSlot(adUnitPath, sizes, shortId);
                    if (slot) {
                        var lazySlots = ['d_side_2', 'd_bottom_1', 'm_mobile_2', 'm_mobile_3', 'm_mobile_4'];
                        slot.setTargeting('loading', lazySlots.indexOf(shortId) !== -1 ? 'lazy' : 'normal');
                        slot.addService(googletag.pubads());
                        window._gptSlots[shortId] = slot;
                        console.log('[Prebid] Defined slot:', shortId, 'path:', adUnitPath, 'sizes:', sizes.length);
                    }
                });

                // Configure pubads
                googletag.pubads().setCentering(true);
                googletag.pubads().disableInitialLoad();
                googletag.pubads().setTargeting('URL', ['www.transfermarkt.com']);
                // Content group targeting: try immediately, poll if not ready yet
                if (!applyContentGroupTargeting()) {
                    console.log('[Prebid] tmAnalytics not yet available, starting poll...');
                    startContentGroupPolling();
                }

                googletag.enableServices();

                console.log('[Prebid] GPT slots defined:', Object.keys(window._gptSlots).join(', '));
                resolve();
            });
        });
    }

    // Display all defined GPT slots
    function displaySlots() {
        googletag.cmd.push(function() {
            Object.keys(window._gptSlots).forEach(function(divId) {
                console.log('[Prebid] Displaying slot:', divId);
                googletag.display(divId);
            });
        });
    }

    // â”€â”€ Slot Refresh Strategy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Refresh all GPT slots at once
    function refreshAllSlots() {
        googletag.cmd.push(function() {
            var slots = Object.values(window._gptSlots);
            if (slots.length > 0) {
                console.log('[Prebid] Refreshing all slots:', Object.keys(window._gptSlots).join(', '));
                googletag.pubads().refresh(slots);
                Object.keys(window._gptSlots).forEach(function(divId) {
                    window._prebidRefreshedSlots[divId] = true;
                });
            }
        });
    }

    // Smart refresh: above-fold immediately, below-fold via IntersectionObserver
    function refreshSlotsSmartly() {
        googletag.cmd.push(function() {
            var aboveFoldSlots = [];
            var belowFoldDivs = [];

            Object.keys(window._gptSlots).forEach(function(divId) {
                var element = document.getElementById(divId);
                if (element) {
                    var rect = element.getBoundingClientRect();
                    var isAboveFold = rect.top < window.innerHeight + VIEWPORT_MARGIN_PX;
                    if (isAboveFold) {
                        aboveFoldSlots.push(window._gptSlots[divId]);
                        window._prebidRefreshedSlots[divId] = true;
                        console.log('[Prebid] Slot above fold:', divId);
                    } else {
                        belowFoldDivs.push(divId);
                        console.log('[Prebid] Slot below fold:', divId);
                    }
                }
            });

            if (aboveFoldSlots.length > 0) {
                console.log('[Prebid] Refreshing', aboveFoldSlots.length, 'above-fold slots');
                googletag.pubads().refresh(aboveFoldSlots);
            }

            if (belowFoldDivs.length > 0) {
                console.log('[Prebid] Setting up viewport observer for', belowFoldDivs.length, 'below-fold slots');
                setupViewportObserver();
            }
        });
    }

    // Lazy-load below-fold slots when they approach the viewport
    function setupViewportObserver() {
        if (_prebidViewportObserver) {
            console.log('[Prebid] Viewport observer already set up');
            return;
        }

        if (!('IntersectionObserver' in window)) {
            console.warn('[Prebid] IntersectionObserver not supported - refreshing all slots immediately');
            refreshAllSlots();
            return;
        }

        console.log('[Prebid] Setting up viewport observer with ' + VIEWPORT_MARGIN_PX + 'px margin');

        _prebidViewportObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var divId = entry.target.id;

                    if (window._prebidRefreshedSlots[divId]) {
                        return;
                    }

                    var gptSlot = window._gptSlots[divId];
                    if (gptSlot) {
                        console.log('[Prebid] Slot entering viewport range:', divId);
                        window._prebidRefreshedSlots[divId] = true;
                        googletag.pubads().refresh([gptSlot]);
                        _prebidViewportObserver.unobserve(entry.target);
                    }
                }
            });
        }, {
            root: null,
            rootMargin: VIEWPORT_MARGIN_PX + 'px 0px ' + VIEWPORT_MARGIN_PX + 'px 0px',
            threshold: 0
        });

        Object.keys(window._gptSlots).forEach(function(divId) {
            var element = document.getElementById(divId);
            if (element && !window._prebidRefreshedSlots[divId]) {
                console.log('[Prebid] Observing slot for viewport:', divId);
                _prebidViewportObserver.observe(element);
            }
        });

        console.log('[Prebid] Viewport observer active');
    }

    // ── Viewable Auto-Refresh ──────────────────────────────────────────
    // Refreshes each slot every 45s of accumulated viewable time. A slot
    // is "viewable" per MRC active view: ≥50% of its pixels visible for
    // ≥1 continuous second. The 45s timer pauses when the slot leaves
    // the viewport or the tab is hidden, and resumes on return — the
    // user must keep looking at the slot to keep the clock ticking.
    // Only fires for slots that have already been initially refreshed.
    // No cap on refreshes per slot.

    var VIEWABLE_REFRESH_INTERVAL_MS = 30000;
    var VIEWABLE_DWELL_MS = 1000;
    var VIEWABLE_MIN_RATIO = 0.5;

    var _viewableObserver = null;
    var _viewableState = {};
    var _viewableVisibilityHooked = false;

    function _vrState(divId) {
        if (!_viewableState[divId]) {
            _viewableState[divId] = {
                refreshCount: 0,
                viewableMs: 0,    // accumulated viewable time since last refresh
                enterAt: null,    // ms timestamp when slot last entered viewport (null when not viewable)
                dwellTimer: null, // setTimeout for the 1s dwell before counting starts
                refreshTimer: null
            };
        }
        return _viewableState[divId];
    }

    function _vrPause(divId) {
        var s = _viewableState[divId];
        if (!s) return;
        if (s.dwellTimer) { clearTimeout(s.dwellTimer); s.dwellTimer = null; }
        if (s.refreshTimer) { clearTimeout(s.refreshTimer); s.refreshTimer = null; }
        if (s.enterAt != null) {
            s.viewableMs += Date.now() - s.enterAt;
            s.enterAt = null;
        }
    }

    function _vrResume(divId) {
        var s = _vrState(divId);
        if (!window._prebidRefreshedSlots[divId]) return; // wait for initial render
        if (document.visibilityState !== 'visible') return;
        if (s.refreshTimer || s.dwellTimer) return;

        s.dwellTimer = setTimeout(function() {
            s.dwellTimer = null;
            s.enterAt = Date.now();
            var remaining = VIEWABLE_REFRESH_INTERVAL_MS - s.viewableMs;
            if (remaining <= 0) { _vrFireRefresh(divId); return; }
            s.refreshTimer = setTimeout(function() { _vrFireRefresh(divId); }, remaining);
        }, VIEWABLE_DWELL_MS);
    }

    function _vrFireRefresh(divId) {
        var s = _viewableState[divId];
        var slot = window._gptSlots[divId];
        if (!s || !slot) return;
        s.refreshTimer = null;
        if (s.enterAt != null) { s.viewableMs += Date.now() - s.enterAt; s.enterAt = null; }
        s.refreshCount++;
        s.viewableMs = 0;
        console.log('[Prebid] Viewable refresh #' + s.refreshCount + ' for', divId);
        googletag.pubads().refresh([slot]);
        // Still viewable post-refresh: re-arm the 45s clock immediately (no second dwell)
        if (document.visibilityState === 'visible') {
            s.enterAt = Date.now();
            s.refreshTimer = setTimeout(function() { _vrFireRefresh(divId); }, VIEWABLE_REFRESH_INTERVAL_MS);
        }
    }

    function startViewableAutoRefresh() {
        if (_viewableObserver) return;
        if (!('IntersectionObserver' in window)) {
            console.warn('[Prebid] IntersectionObserver not supported - viewable auto-refresh disabled');
            return;
        }

        _viewableObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                var divId = entry.target.id;
                var viewable = entry.isIntersecting && entry.intersectionRatio >= VIEWABLE_MIN_RATIO;
                if (viewable) {
                    _vrResume(divId);
                } else {
                    _vrPause(divId);
                }
            });
        }, { threshold: [0, VIEWABLE_MIN_RATIO, 1] });

        Object.keys(window._gptSlots).forEach(function(divId) {
            var el = document.getElementById(divId);
            if (el) _viewableObserver.observe(el);
        });

        if (!_viewableVisibilityHooked) {
            _viewableVisibilityHooked = true;
            document.addEventListener('visibilitychange', function() {
                if (document.visibilityState === 'hidden') {
                    Object.keys(_viewableState).forEach(_vrPause);
                }
                // On 'visible', the IntersectionObserver will redeliver entries
                // for currently-intersecting slots, which calls _vrResume.
            });
        }

        console.log('[Prebid] Viewable auto-refresh enabled: ' + VIEWABLE_REFRESH_INTERVAL_MS + 'ms interval, ' + (VIEWABLE_MIN_RATIO * 100) + '% threshold, ' + VIEWABLE_DWELL_MS + 'ms dwell');
    }

    // â”€â”€ Prebid Config Application â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    function applyGlobalConfig(config) {
        var settings = {};

        if (config.globalConfig) {
            if (config.globalConfig.debug !== undefined) {
                settings.debug = config.globalConfig.debug;
            }
            if (config.globalConfig.bidderTimeout) {
                settings.bidderTimeout = config.globalConfig.bidderTimeout;
            }
            if (config.globalConfig.priceGranularity) {
                settings.priceGranularity = config.globalConfig.priceGranularity;
            }
            if (config.globalConfig.enableSendAllBids !== undefined) {
                settings.enableSendAllBids = config.globalConfig.enableSendAllBids;
            }
            if (config.globalConfig.useBidCache !== undefined) {
                settings.useBidCache = config.globalConfig.useBidCache;
            }
            if (config.globalConfig.currency) {
                settings.currency = config.globalConfig.currency;
            }
            if (config.globalConfig.deviceAccess !== undefined) {
                settings.deviceAccess = config.globalConfig.deviceAccess;
            }
            if (config.globalConfig.enableTIDs !== undefined) {
                settings.enableTIDs = config.globalConfig.enableTIDs;
            }
            if (config.globalConfig.maxRequestsPerOrigin !== undefined) {
                settings.maxRequestsPerOrigin = config.globalConfig.maxRequestsPerOrigin;
            }
            if (config.globalConfig.disableAjaxTimeout !== undefined) {
                settings.disableAjaxTimeout = config.globalConfig.disableAjaxTimeout;
            }
            if (config.globalConfig.ttlBuffer !== undefined) {
                settings.ttlBuffer = config.globalConfig.ttlBuffer;
            }
            if (config.globalConfig.allowPrerendering !== undefined) {
                settings.allowPrerendering = config.globalConfig.allowPrerendering;
            }
            if (config.globalConfig.bidderSequence) {
                settings.bidderSequence = config.globalConfig.bidderSequence;
            }
            if (config.globalConfig.pageUrl) {
                settings.pageUrl = config.globalConfig.pageUrl;
            }
            if (config.globalConfig.maxBid !== undefined) {
                settings.maxBid = config.globalConfig.maxBid;
            }
            if (config.globalConfig.minBidCacheTTL !== undefined) {
                settings.minBidCacheTTL = config.globalConfig.minBidCacheTTL;
            }
            if (config.globalConfig.coppa !== undefined) {
                settings.coppa = config.globalConfig.coppa;
            }
            if (config.globalConfig.maxNestedIframes !== undefined) {
                settings.maxNestedIframes = config.globalConfig.maxNestedIframes;
            }
            if (config.globalConfig.performanceMetrics !== undefined) {
                settings.performanceMetrics = config.globalConfig.performanceMetrics;
            }
            if (config.globalConfig.eventHistoryTTL !== undefined) {
                settings.eventHistoryTTL = config.globalConfig.eventHistoryTTL;
            }
        }

        // Advanced nested objects
        if (config.sendBidsControl) {
            settings.sendBidsControl = config.sendBidsControl;
        }
        if (config.targetingControls) {
            settings.targetingControls = config.targetingControls;
        }
        if (config.auctionOptions) {
            settings.auctionOptions = config.auctionOptions;
        }
        if (config.mediaTypePriceGranularity) {
            settings.mediaTypePriceGranularity = config.mediaTypePriceGranularity;
        }

        // Consent Management
        if (config.consentManagement && !DEMO_MODE) {
            settings.consentManagement = {};
            if (config.consentManagement.gdpr) {
                settings.consentManagement.gdpr = config.consentManagement.gdpr;
            }
            if (config.consentManagement.usp) {
                settings.consentManagement.usp = config.consentManagement.usp;
            }
            if (config.consentManagement.gpp) {
                settings.consentManagement.gpp = config.consentManagement.gpp;
            }
        } else if (DEMO_MODE) {
            console.log('[Prebid] Demo mode: skipping consent management');
        }

        // Supply Chain
        if (config.schain) {
            settings.schain = config.schain;
        }

        // Cache
        if (config.cache) {
            settings.cache = config.cache;
        }

        // User Sync
        if (config.userSync) {
            settings.userSync = config.userSync;
        }

        // Bidder Settings
        if (config.bidderSettings) {
            pbjs.bidderSettings = config.bidderSettings;
        }

        // Real-time data modules
        if (config.realTimeData) {
            settings.realTimeData = config.realTimeData;
        }

        // ORTB2
        if (config.ortb2) {
            settings.ortb2 = config.ortb2;
        }

        // Floors
        if (config.floors) {
            settings.floors = config.floors;
        }

        return settings;
    }

    // â”€â”€ Bid Handling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    function handleBidResponse() {
        console.log('%c [Prebid] Auction Complete', 'background: #1a472a; color: #fff');

        var allBids = pbjs.getBidResponses();
        var adUnitCodes = Object.keys(allBids);

        console.log('[Prebid] Bid responses:', adUnitCodes.length, 'ad units');

        adUnitCodes.forEach(function(adUnitCode) {
            var bids = allBids[adUnitCode].bids || [];
            var shortId = getShortDivId(adUnitCode);

            console.log('[Prebid] ' + shortId + ':', bids.length, 'bids');
            bids.forEach(function(bid) {
                console.log('  - ' + bid.bidder + ': \u20AC' + bid.cpm.toFixed(2) + ' (' + bid.width + 'x' + bid.height + ')');
            });
        });

        // Log no-bids
        var noBids = pbjs.getNoBids();
        if (Object.keys(noBids).length > 0) {
            console.log('[Prebid] No bids from:', Object.keys(noBids).map(function(k) { return getShortDivId(k); }).join(', '));
        }

        // Set targeting on GPT slots
        googletag.cmd.push(function() {
            console.log('[Prebid] Setting targeting on GPT slots...');
            // Last-chance attempt to apply content group targeting before refresh
            applyContentGroupTargeting(); 

            pbjs.setTargetingForGPTAsync();

            // Also apply targeting manually per-slot for reliability
            var targeting = pbjs.getAdserverTargeting();
            console.log('[Prebid] Targeting data:', JSON.stringify(targeting, null, 2));

            Object.keys(window._gptSlots).forEach(function(divId) {
                var slot = window._gptSlots[divId];
                var slotPath = slot.getAdUnitPath();

                var matchingTargeting = targeting[slotPath];
                if (matchingTargeting) {
                    Object.keys(matchingTargeting).forEach(function(key) {
                        var value = matchingTargeting[key];
                        if (!Array.isArray(value)) {
                            value = [value];
                        }
                        slot.setTargeting(key, value);
                    });
                    console.log('[Prebid] Set targeting on', divId, ':', Object.keys(matchingTargeting).join(', '));
                }
            });

            // Log final targeting state
            console.log('%c [Prebid] Final GPT Targeting State:', 'background: #1a472a; color: #fff');
            Object.keys(window._gptSlots).forEach(function(divId) {
                var slot = window._gptSlots[divId];
                var keys = slot.getTargetingKeys();
                var targetingMap = {};
                keys.forEach(function(key) {
                    targetingMap[key] = slot.getTargeting(key);
                });
                console.log('  ' + divId + ':', keys.length > 0 ? targetingMap : '(no targeting)');
            });

            // Mark ready
            window.prebidReady = true;

            // Expose refresh API
            window.prebidRefreshSlots = function(slots) {
                if (slots) {
                    googletag.pubads().refresh(slots);
                } else {
                    refreshAllSlots();
                }
            };

            window.prebidSetupViewportRefresh = setupViewportObserver;

            console.log('[Prebid] Prebid is ready. Refreshing slots...');

            if (typeof window.onPrebidReady === 'function') {
                window.onPrebidReady();
            } else {
                refreshSlotsSmartly();
            }
            startViewableAutoRefresh();
        });
    }

    // Request bids for ad units
    function requestBids(adUnits) {
        console.log('%c [Prebid] Starting bid request for ' + adUnits.length + ' ad units', 'background: #1a472a; color: #fff');

        var adUnitNames = adUnits.map(function(u) { return getShortDivId(u.code); }).join(', ');
        console.log('[Prebid] Ad units:', adUnitNames);

        pbjs.que.push(function() {
            pbjs.requestBids({
                adUnits: adUnits,
                bidsBackHandler: handleBidResponse,
                timeout: (window.prebidConfig && window.prebidConfig.globalConfig && window.prebidConfig.globalConfig.bidderTimeout) || 3000
            });
        });
    }

    // â”€â”€ Initialization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    function initPrebid(config) {
        console.log('%c[Prebid] initPrebid called', 'background: purple; color: white');
        window.prebidConfig = config;

        pbjs.que.push(function() {
            console.log('%c[Prebid] pbjs.que callback executing', 'background: purple; color: white');
            window.prebidConfig._queExecuted = true;

            var settings = applyGlobalConfig(config);
            console.log('[Prebid] Config loaded:', {
                profile: config._meta && config._meta.profileName,
                version: config.version,
                debug: settings.debug,
                bidderTimeout: settings.bidderTimeout,
                currency: settings.currency
            });
            pbjs.setConfig(settings);

            var allAdUnits = buildAdUnits(config);

            // Filter to ad units with matching DOM elements and valid prefix
            var adUnits = allAdUnits.filter(function(unit) {
                var shortId = getShortDivId(unit.code);
                var hasElement = document.getElementById(shortId);
                var isValidUnit = shortId.startsWith('d_') || shortId.startsWith('m_');

                if (!hasElement && isValidUnit) {
                    console.log('[Prebid] Skipping', unit.code, '(' + shortId + ') - no DOM element');
                }

                return hasElement && isValidUnit;
            });

            console.log('[Prebid] Found', adUnits.length, 'active ad units:', adUnits.map(function(u) { return getShortDivId(u.code); }).join(', '));

            window.prebidAdUnits = adUnits;

            if (adUnits.length > 0) {
                requestBids(adUnits);
            } else {
                console.warn('[Prebid] No matching ad units found on page');
                window.prebidReady = true;
            }
        });

        // Failsafe: if pbjs.que never executes, unblock after 3s
        setTimeout(function() {
            if (!window.prebidConfig._queExecuted) {
                console.error('[Prebid] CRITICAL: pbjs.que callback never executed after 3s');
                window.prebidReady = true;
                if (typeof window.onPrebidReady === 'function') {
                    window.onPrebidReady();
                } else {
                    refreshSlotsSmartly();
                }
                startViewableAutoRefresh();
            }
        }, 3000);
    }

    // Load config from S3
    function loadConfig() {
        console.log('%c [Prebid] Loading config...', 'background: #1a472a; color: #fff');
        console.log('[Prebid] URL:', CONFIG_URL);

        var cacheBuster = CONFIG_URL + '?v=' + Date.now();

        fetch(cacheBuster)
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status);
                }
                return response.json();
            })
            .then(function(config) {
                console.log('%c [Prebid] Config loaded', 'background: #1a472a; color: #fff');
                defineGPTSlots(config).then(function() {
                    displaySlots();
                    initPrebid(config);
                });
            })
            .catch(function(error) {
                console.error('[Prebid] Failed to load config:', error.message);
            });
    }

    // Bootstrap: load GPT then config
    function init() {
        console.log('%c [Prebid] Initializing...', 'background: #1a472a; color: #fff');
        loadGPT().then(function() {
            loadConfig();
        }).catch(function(error) {
            console.error('[Prebid] Failed to initialize:', error);
        });
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();