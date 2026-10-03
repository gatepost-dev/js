// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import { PostcodeClient, type ReverseResult } from '@gatepost/client';
import { parse, type Postcode } from '@gatepost/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { ErrorDetail } from '../src/index.js';
import { postcodeAtFix, radiusFor } from '../src/location.js';
import { expectAccessible, mount } from './field.js';
import { fixture, scriptGateway } from './gateway.js';

const KEY = 'nipost_pk_test_mock';
const FIELD = `<gatepost-postcode-field api-key="${KEY}" gps></gatepost-postcode-field>`;
const COARSE = 'We added part of your postcode from your location. Type the rest.';
const UNAVAILABLE = 'We could not find your location. Type your postcode.';
const NOT_FOUND = 'We found no postcode at your location. Type your postcode.';

afterEach(() => {
  vi.restoreAllMocks();
});

function postcode(text: string): Postcode {
  const parsed = parse(text, { allowPartial: true });
  if (!parsed.ok) {
    throw new Error(`${text} does not parse.`);
  }
  return parsed.value;
}

const FOUND: ReverseResult = {
  found: true,
  radiusM: 25,
  unit: {
    postcode: postcode('FC-01-Z99-ZZ-01'),
    distanceM: 4.2,
    confidence: 'low',
    stateName: null,
    lgaName: null,
    localityName: null,
    address: null,
  },
  area: 'FC-01-Z99-ZZ',
  district: 'FC-01-Z99',
  state: 'FC',
};

// The browser's location, at the point of the synthetic unit, with the given accuracy.
function placeDevice(accuracy: number): void {
  vi.spyOn(navigator.geolocation, 'getCurrentPosition').mockImplementation((success) => {
    success({ coords: { latitude: 9, longitude: 7, accuracy } } as GeolocationPosition);
  });
}

// The browser's location, which the test gives later through the returned function.
function holdDevice(): (accuracy: number) => void {
  let place: (position: GeolocationPosition) => void = () => undefined;
  vi.spyOn(navigator.geolocation, 'getCurrentPosition').mockImplementation((success) => {
    place = success;
  });
  return (accuracy) => {
    place({ coords: { latitude: 9, longitude: 7, accuracy } } as GeolocationPosition);
  };
}

// GeolocationPositionError has no public constructor, so the stand-in borrows its prototype.
function refuseLocation(code: number): void {
  const error = Object.create(GeolocationPositionError.prototype, {
    code: { value: code },
  }) as GeolocationPositionError;
  vi.spyOn(navigator.geolocation, 'getCurrentPosition').mockImplementation((_success, failure) => {
    failure?.(error);
  });
}

function listen(target: EventTarget): ErrorDetail[] {
  const details: ErrorDetail[] = [];
  target.addEventListener('gatepost-error', (event) => {
    details.push((event as CustomEvent<ErrorDetail>).detail);
  });
  return details;
}

describe('radiusFor', () => {
  it.each([
    [3, 25],
    [40.2, 41],
    [900, 250],
  ])('gives a radius of %d m a radius of %d m', (accuracy, radius) => {
    expect(radiusFor(accuracy)).toBe(radius);
  });
});

describe('postcodeAtFix', () => {
  it.each([
    [5, 'FC-01-Z99-ZZ-01'],
    [15, 'FC-01-Z99-ZZ'],
    [40, 'FC-01-Z99'],
    [80, 'FC-01'],
  ])('keeps the segments that an accuracy of %d m supports', (accuracy, canonical) => {
    expect(postcodeAtFix(FOUND, accuracy)?.canonical).toBe(canonical);
  });

  it('uses the area when the result has no unit, and keeps it whole for a precise fix', () => {
    expect(postcodeAtFix({ ...FOUND, unit: null }, 5)?.canonical).toBe('FC-01-Z99-ZZ');
  });

  it('truncates the area of a result with no unit, and the district with no area', () => {
    expect(postcodeAtFix({ ...FOUND, unit: null }, 80)?.canonical).toBe('FC-01');
    const district = { ...FOUND, unit: null, area: null };
    expect(postcodeAtFix(district, 15)?.canonical).toBe('FC-01-Z99');
  });

  it('gives null when the result holds no postcode that parses', () => {
    const empty = { ...FOUND, found: false, unit: null, area: null, district: 'not a code' };
    expect(postcodeAtFix(empty, 5)).toBeNull();
  });
});

describe('the location button', () => {
  it('shows only with gps and a key', () => {
    expect(mount(FIELD).location.hidden).toBe(false);
    expect(mount('<gatepost-postcode-field gps></gatepost-postcode-field>').location.hidden).toBe(
      true,
    );
    expect(
      mount(`<gatepost-postcode-field api-key="${KEY}"></gatepost-postcode-field>`).location.hidden,
    ).toBe(true);
  });

  it('shows no button for a secret key', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const html =
      '<gatepost-postcode-field api-key="nipost_live_abc" gps></gatepost-postcode-field>';
    expect(mount(html).location.hidden).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('fills in a whole postcode from a precise location, and then confirms it', async () => {
    placeDevice(5);
    const { requests } = scriptGateway(
      await fixture('reverse/unit'),
      await fixture('lookup/valid-level-1'),
    );
    const { input, location, message, changes } = mount(FIELD);
    await userEvent.click(location);
    await vi.waitFor(() => {
      expect(message()).toBe('We found this postcode in Federal Capital Territory.');
    });
    expect(input.value).toBe('FC 01 Z99 ZZ 01');
    expect(changes).toEqual([
      expect.objectContaining({ value: 'FC-01-Z99-ZZ-01', source: 'gps', accuracyM: 5 }),
    ]);
    expect(requests[0]?.url.pathname).toBe('/v1/search/reverse');
    expect(requests[0]?.url.searchParams.get('max_distance_m')).toBe('25');
  });

  it('coarse GPS: fills in only the district, and asks the user to type the rest', async () => {
    placeDevice(40);
    const { requests } = scriptGateway(await fixture('reverse/unit'));
    const { field, input, location, message } = mount(FIELD);
    await userEvent.click(location);
    await vi.waitFor(() => {
      expect(message()).toBe(COARSE);
    });
    expect(input.value).toBe('FC 01 Z99 ');
    expect(field.shadowRoot?.activeElement).toBe(input);
    expect(field.checkValidity()).toBe(false);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.searchParams.get('max_distance_m')).toBe('40');
    await expectAccessible();
  });

  it('coarse GPS: a fix worse than 50 m fills in the state and the LGA only', async () => {
    placeDevice(80);
    scriptGateway(await fixture('reverse/unit'));
    const { input, location, message } = mount(FIELD);
    await userEvent.click(location);
    await vi.waitFor(() => {
      expect(message()).toBe(COARSE);
    });
    expect(input.value).toBe('FC 01 ');
  });

  it('fills in the area of a result with no unit, and sends no lookup for it', async () => {
    placeDevice(5);
    const { requests } = scriptGateway(await fixture('reverse/area'));
    const { input, location, message } = mount(FIELD);
    await userEvent.click(location);
    await vi.waitFor(() => {
      expect(message()).toBe(COARSE);
    });
    expect(input.value).toBe('FC 01 Z99 ZZ ');
    expect(requests).toHaveLength(1);
  });

  it('never shows the address of the unit that reverse found', async () => {
    placeDevice(5);
    const unit = await fixture('reverse/unit');
    const body = (await unit.json()) as { data: { unit: Record<string, unknown> } };
    body.data.unit['address'] = '12 SYNTHETIC STREET';
    scriptGateway(Response.json(body), await fixture('lookup/valid-level-2'));
    const { field, location, message } = mount(FIELD);
    await userEvent.click(location);
    await vi.waitFor(() => {
      expect(message()).toContain('We found this postcode');
    });
    expect(field.shadowRoot?.textContent).not.toContain('SYNTHETIC STREET');
  });

  it('permission denied: says so, raises gps_denied, and keeps the input ready', async () => {
    refuseLocation(1);
    const fetch = vi.spyOn(globalThis, 'fetch');
    const { form, input, location, message } = mount(FIELD);
    const errors = listen(form);
    await userEvent.click(location);
    expect(message()).toBe('We cannot use your location. Type your postcode.');
    expect(errors).toEqual([{ code: 'gps_denied' }]);
    expect(input.disabled).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    await expectAccessible();
  });

  it('says when the device gives no location', async () => {
    refuseLocation(2);
    const { form, location, message } = mount(FIELD);
    const errors = listen(form);
    await userEvent.click(location);
    expect(message()).toBe('We could not find your location. Type your postcode.');
    expect(errors).toEqual([{ code: 'gps_unavailable' }]);
  });

  it('says when the device gives no location within the time limit', async () => {
    refuseLocation(3);
    const { form, location, message } = mount(FIELD);
    const errors = listen(form);
    await userEvent.click(location);
    expect(message()).toBe('We could not find your location. Type your postcode.');
    expect(errors).toEqual([{ code: 'gps_unavailable' }]);
  });

  it('says that the location is unavailable in a browser with no location API', async () => {
    const api = Object.getOwnPropertyDescriptor(Navigator.prototype, 'geolocation')!;
    Reflect.deleteProperty(Navigator.prototype, 'geolocation');
    try {
      const { form, location, message } = mount(FIELD);
      const errors = listen(form);
      await userEvent.click(location);
      expect(message()).toBe('We could not find your location. Type your postcode.');
      expect(errors).toEqual([{ code: 'gps_unavailable' }]);
    } finally {
      Object.defineProperty(Navigator.prototype, 'geolocation', api);
    }
  });

  it('says when the gateway has no postcode at the location', async () => {
    placeDevice(5);
    scriptGateway(await fixture('reverse/not-found'));
    const { form, location, message } = mount(FIELD);
    const errors = listen(form);
    await userEvent.click(location);
    await vi.waitFor(() => {
      expect(message()).toBe(NOT_FOUND);
    });
    expect(errors).toEqual([]);
  });

  it('raises the error code of the client when reverse fails', async () => {
    placeDevice(5);
    scriptGateway(await fixture('errors/rate-limited'));
    const { form, location, message } = mount(FIELD);
    const errors = listen(form);
    await userEvent.click(location);
    await vi.waitFor(() => {
      expect(errors).toEqual([{ code: 'rate_limited' }]);
    });
    expect(message()).toBe('We could not find your location. Type your postcode.');
  });

  it('ends as a failed request when the base-url has no scheme', async () => {
    placeDevice(5);
    const { requests } = scriptGateway();
    const { form, location, message } = mount(
      `<gatepost-postcode-field api-key="${KEY}" base-url="127.0.0.1:4010" gps>` +
        '</gatepost-postcode-field>',
    );
    const errors = listen(form);
    await userEvent.click(location);
    await vi.waitFor(() => {
      expect(message()).toBe(UNAVAILABLE);
    });
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
  });

  it('ends as a failed request when the client throws a plain error', async () => {
    placeDevice(5);
    vi.spyOn(PostcodeClient.prototype, 'reverse').mockRejectedValueOnce(new Error('It broke.'));
    const { form, location, message } = mount(FIELD);
    const errors = listen(form);
    await userEvent.click(location);
    await vi.waitFor(() => {
      expect(message()).toBe(UNAVAILABLE);
    });
    expect(errors).toEqual([]);
  });

  it('ends as a failed request when the device call throws a plain error', async () => {
    vi.spyOn(navigator.geolocation, 'getCurrentPosition').mockImplementation(() => {
      throw new Error('It broke.');
    });
    const { form, location, message } = mount(FIELD);
    const errors = listen(form);
    await userEvent.click(location);
    await vi.waitFor(() => {
      expect(message()).toBe(UNAVAILABLE);
    });
    expect(errors).toEqual([]);
  });

  it('shows the state GPS locating, and typing cancels it', async () => {
    const place = holdDevice();
    const fetch = vi.spyOn(globalThis, 'fetch');
    const { input, location, message } = mount(FIELD);
    await userEvent.click(location);
    expect(message()).toBe('Finding your location.');
    await expectAccessible();
    await userEvent.type(input, 'FC');
    place(5);
    await Promise.resolve();
    expect(input.value).toBe('FC');
    expect(message()).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('comes after the input in the tab order, and works with the Enter key', async () => {
    placeDevice(5);
    scriptGateway(await fixture('reverse/not-found'));
    const { field, input, location, message } = mount(FIELD);
    input.focus();
    await userEvent.tab();
    expect(field.shadowRoot?.activeElement).toBe(location);
    await userEvent.keyboard('{Enter}');
    await vi.waitFor(() => {
      expect(message()).toBe(NOT_FOUND);
    });
  });

  it('turns off with the form', () => {
    const { location } = mount(`<fieldset disabled>${FIELD}</fieldset>`);
    expect(location.disabled).toBe(true);
  });
});

describe('a location request and the settings', () => {
  it('keeps the message of a refused location when required changes', async () => {
    refuseLocation(1);
    const { field, location, message } = mount(FIELD);
    await userEvent.click(location);
    field.setAttribute('required', '');
    expect(message()).toBe('We cannot use your location. Type your postcode.');
  });

  it('keeps the location request when a setting changes', async () => {
    const place = holdDevice();
    scriptGateway(await fixture('reverse/unit'), await fixture('lookup/valid-level-1'));
    const { field, input, location, message } = mount(FIELD);
    await userEvent.click(location);
    field.setAttribute('required', '');
    expect(message()).toBe('Finding your location.');
    place(5);
    await vi.waitFor(() => {
      expect(message()).toBe('We found this postcode in Federal Capital Territory.');
    });
    expect(input.value).toBe('FC 01 Z99 ZZ 01');
  });

  it('sends reverse with the key that the field holds when the position arrives', async () => {
    const place = holdDevice();
    const { requests } = scriptGateway(
      await fixture('reverse/unit'),
      await fixture('reverse/unit'),
    );
    const { field, location } = mount(FIELD);
    await userEvent.click(location);
    field.setAttribute('api-key', 'nipost_pk_test_other');
    place(40);
    await vi.waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    expect(requests[0]?.headers.get('X-API-Key')).toBe('nipost_pk_test_other');
  });

  it('sends nothing and says so when the key is a secret key as the position arrives', async () => {
    const place = holdDevice();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetch = vi.spyOn(globalThis, 'fetch');
    const { form, field, location, message } = mount(FIELD);
    const errors = listen(form);
    await userEvent.click(location);
    field.setAttribute('api-key', 'nipost_live_abc');
    place(5);
    await vi.waitFor(() => {
      expect(errors).toEqual([{ code: 'secret_key' }]);
    });
    expect(message()).toBe('We cannot check postcodes on this page. You can still continue.');
    expect(fetch).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('sends nothing and shows the state of the text when the key is gone', async () => {
    const place = holdDevice();
    const fetch = vi.spyOn(globalThis, 'fetch');
    const { form, field, location, message } = mount(FIELD);
    const errors = listen(form);
    await userEvent.click(location);
    field.removeAttribute('api-key');
    place(5);
    await Promise.resolve();
    await Promise.resolve();
    expect(message()).toBe('');
    expect(errors).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lets a reverse call that was sent before a key change finish', async () => {
    placeDevice(40);
    let answer: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const { requests } = scriptGateway(pending);
    const { field, input, location, message } = mount(FIELD);
    await userEvent.click(location);
    await vi.waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    field.setAttribute('api-key', 'nipost_pk_test_other');
    answer(await fixture('reverse/unit'));
    await vi.waitFor(() => {
      expect(message()).toBe(COARSE);
    });
    expect(input.value).toBe('FC 01 Z99 ');
  });

  it('checks a location again, even after the same postcode was confirmed', async () => {
    placeDevice(5);
    const { requests } = scriptGateway(
      await fixture('lookup/valid-level-1'),
      await fixture('reverse/unit'),
      await fixture('lookup/valid-level-1'),
    );
    const { input, location, message } = mount(FIELD);
    await userEvent.type(input, 'FC01Z99ZZ01');
    await vi.waitFor(() => {
      expect(message()).toBe('We found this postcode in Federal Capital Territory.');
    });
    await userEvent.click(location);
    await vi.waitFor(() => {
      expect(requests).toHaveLength(3);
    });
    expect(requests.map((request) => request.url.pathname)).toEqual([
      '/v1/lookup',
      '/v1/search/reverse',
      '/v1/lookup',
    ]);
  });

  it('checks a location again, even after a lookup of it was cancelled', async () => {
    placeDevice(5);
    const never = new Promise<Response>(() => undefined);
    const { requests } = scriptGateway(
      never,
      await fixture('reverse/unit'),
      await fixture('lookup/valid-level-1'),
    );
    const { input, location, message } = mount(FIELD);
    await userEvent.type(input, 'FC01Z99ZZ01');
    await userEvent.click(location);
    await vi.waitFor(() => {
      expect(message()).toBe('We found this postcode in Federal Capital Territory.');
    });
    expect(requests).toHaveLength(3);
  });

  it('raises no change when a location fill keeps the form value', async () => {
    placeDevice(40);
    scriptGateway(await fixture('reverse/unit'));
    const { input, location, message, changes } = mount(FIELD);
    await userEvent.type(input, 'FC 01 Z99 ');
    const before = changes.length;
    await userEvent.click(location);
    await vi.waitFor(() => {
      expect(message()).toBe(COARSE);
    });
    expect(changes).toHaveLength(before);
  });
});
