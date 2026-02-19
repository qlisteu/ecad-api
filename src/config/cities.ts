export interface CityConfig {
  id: string;
  name: string;
  county: string;
  urbanismService: {
    baseUrl: string;
    searchUrl: string;
    featuresUrl: string;
    requiresAuth: boolean;
    customHeaders?: Record<string, string>;
  };
  coordinates: {
    epsg: string;
    defaultBuffer: number;
  };
}

export const CITIES_CONFIG: CityConfig[] = [
  {
    id: 'bucuresti-ilfov',
    name: 'București',
    county: 'Ilfov',
    urbanismService: {
      baseUrl: 'https://urbanism.pmb.ro/xportalurb',
      searchUrl: '/Map/MapSearch?searchText={address}&idMap=2&idMapSearch=%5B3%2C4%5D&filter%5Bfilters%5D%5B0%5D%5Bvalue%5D={address}&filter%5Bfilters%5D%5B0%5D%5Bfield%5D=Name&filter%5Bfilters%5D%5B0%5D%5Boperator%5D=contains&filter%5Bfilters%5D%5B0%5D%5BignoreCase%5D=true&filter%5Blogic%5D=and',
      featuresUrl: '/map/getfeature?layer=8&srs=EPSG:3844&bbox={bbox}&idMap=1',
      requiresAuth: true,
      customHeaders: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36',
        'Referer': 'https://urbanism.pmb.ro/xportalurb/general/xpsw.js',
        'x-app': '6'
      }
    },
    coordinates: {
      epsg: 'EPSG:3844',
      defaultBuffer: 700
    }
  },
  {
    id: 'cluj-napoca',
    name: 'Cluj-Napoca',
    county: 'Cluj',
    urbanismService: {
      baseUrl: 'https://gis.primariaclujnapoca.ro',
      searchUrl: '/api/search?q={address}',
      featuresUrl: '/api/features?bbox={bbox}&layers=urbanism',
      requiresAuth: false,
      customHeaders: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    },
    coordinates: {
      epsg: 'EPSG:4326',
      defaultBuffer: 500
    }
  },
  {
    id: 'timisoara',
    name: 'Timișoara',
    county: 'Timiș',
    urbanismService: {
      baseUrl: 'https://gistm.primariatm.ro',
      searchUrl: '/api/v1/urbanism/search?term={address}',
      featuresUrl: '/api/v1/urbanism/zones?bbox={bbox}',
      requiresAuth: true,
      customHeaders: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-API-Key': '{API_KEY}'
      }
    },
    coordinates: {
      epsg: 'EPSG:4326',
      defaultBuffer: 600
    }
  },
  {
    id: 'iasi',
    name: 'Iași',
    county: 'Iași',
    urbanismService: {
      baseUrl: 'https://eportal.primaria-iasi.ro',
      searchUrl: '/api/urbanism/search?query={address}',
      featuresUrl: '/api/urbanism/features?bbox={bbox}',
      requiresAuth: true,
      customHeaders: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    },
    coordinates: {
      epsg: 'EPSG:4326',
      defaultBuffer: 550
    }
  },
  {
    id: 'brasov',
    name: 'Brașov',
    county: 'Brașov',
    urbanismService: {
      baseUrl: 'https://gis.cjbrasov.ro',
      searchUrl: '/services/urbanism/search?q={address}',
      featuresUrl: '/services/urbanism/zones?bbox={bbox}',
      requiresAuth: false,
      customHeaders: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    },
    coordinates: {
      epsg: 'EPSG:4326',
      defaultBuffer: 500
    }
  },
  {
    id: 'constanta',
    name: 'Constanța',
    county: 'Constanța',
    urbanismService: {
      baseUrl: 'https://geoportal.primariaconstanta.ro',
      searchUrl: '/api/v1/urbanism/search?address={address}',
      featuresUrl: '/api/v1/urbanism/zones?bbox={bbox}',
      requiresAuth: false,
      customHeaders: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    },
    coordinates: {
      epsg: 'EPSG:4326',
      defaultBuffer: 650
    }
  }
];

export function getCityConfig(cityId: string): CityConfig | undefined {
  return CITIES_CONFIG.find(city => city.id === cityId);
}

export function getCitiesByCounty(county: string): CityConfig[] {
  return CITIES_CONFIG.filter(city => city.county === county);
}

export function getAllCounties(): string[] {
  return [...new Set(CITIES_CONFIG.map(city => city.county))];
}
