"""
GoodRx scraper for TransparentRx worker
Implements anti-detection measures:
- User-Agent rotation
- Randomized request timing (3-5 seconds)
- Residential proxy support
- Cookie/session handling
- robots.txt compliance
"""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import random
import time
import logging
from fake_useragent import UserAgent
from bs4 import BeautifulSoup
import urllib.robotparser
from typing import Dict, List, Optional, Any
import json
from datetime import datetime
import re

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class GoodRxScraper:
    """
    GoodRx scraper with comprehensive anti-detection measures.
    Designed to integrate with TransparentRx worker infrastructure.
    """
    
    def __init__(self, 
                 use_proxy: bool = False,
                 proxy_list: List[str] = None,
                 respect_robots: bool = True,
                 min_delay: float = 3.0,
                 max_delay: float = 5.0,
                 worker_id: str = None):
        """
        Initialize the scraper with anti-detection configurations.
        
        Args:
            use_proxy: Whether to use residential proxies
            proxy_list: List of proxy URLs (format: 'http://user:pass@host:port')
            respect_robots: Whether to respect robots.txt rules
            min_delay: Minimum delay between requests (seconds)
            max_delay: Maximum delay between requests (seconds)
            worker_id: Worker ID for logging
        """
        self.base_url = "https://www.goodrx.com"
        self.session = self._create_session()
        self.ua = UserAgent()
        self.use_proxy = use_proxy
        self.proxy_list = proxy_list or []
        self.current_proxy = None
        self.min_delay = min_delay
        self.max_delay = max_delay
        self.last_request_time = 0
        self.robot_parser = None
        self.worker_id = worker_id or "unknown"
        
        # Initialize robots.txt parser if requested
        if respect_robots:
            self._init_robot_parser()
        
        # Rotate initial user-agent
        self._rotate_user_agent()
        
    def _create_session(self) -> requests.Session:
        """Create a requests session with retry strategy and cookie handling."""
        session = requests.Session()
        
        # Configure retry strategy
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS"]
        )
        
        adapter = HTTPAdapter(
            max_retries=retry_strategy,
            pool_connections=10,
            pool_maxsize=20
        )
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        
        # Set default headers that mimic a real browser
        session.headers.update({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
        })
        
        return session
    
    def _init_robot_parser(self):
        """Initialize and parse robots.txt"""
        try:
            self.robot_parser = urllib.robotparser.RobotFileParser()
            self.robot_parser.set_url(f"{self.base_url}/robots.txt")
            self.robot_parser.read()
            logger.info(f"[{self.worker_id}] Successfully parsed robots.txt")
        except Exception as e:
            logger.warning(f"[{self.worker_id}] Failed to parse robots.txt: {e}")
            self.robot_parser = None
    
    def _rotate_user_agent(self):
        """Rotate to a random user-agent."""
        try:
            random_ua = self.ua.random
            self.session.headers.update({'User-Agent': random_ua})
            logger.debug(f"[{self.worker_id}] Rotated User-Agent")
        except Exception as e:
            logger.error(f"[{self.worker_id}] Failed to rotate User-Agent: {e}")
            # Fallback to a common Chrome UA
            fallback_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            self.session.headers.update({'User-Agent': fallback_ua})
    
    def _rotate_proxy(self):
        """Rotate to a random residential proxy from the list."""
        if not self.use_proxy or not self.proxy_list:
            self.current_proxy = None
            return
        
        self.current_proxy = random.choice(self.proxy_list)
        logger.debug(f"[{self.worker_id}] Rotated to proxy")
    
    def _random_delay(self):
        """Implement random delay between requests (3-5 seconds as specified)."""
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        
        # Calculate required delay
        delay = random.uniform(self.min_delay, self.max_delay)
        
        if time_since_last < delay:
            sleep_time = delay - time_since_last
            # Add small random jitter
            sleep_time += random.uniform(0, 0.5)
            logger.debug(f"[{self.worker_id}] Rate limiting: sleeping for {sleep_time:.2f}s")
            time.sleep(sleep_time)
        
        self.last_request_time = time.time()
    
    def _can_fetch(self, url: str) -> bool:
        """Check if we're allowed to fetch the URL according to robots.txt."""
        if not self.robot_parser:
            return True
        
        user_agent = self.session.headers.get('User-Agent', '*')
        return self.robot_parser.can_fetch(user_agent, url)
    
    def _make_request(self, url: str, method: str = 'GET', **kwargs) -> Optional[requests.Response]:
        """Make an HTTP request with all anti-detection measures."""
        # Check robots.txt
        if not self._can_fetch(url):
            logger.warning(f"[{self.worker_id}] robots.txt disallows fetching: {url}")
            return None
        
        # Apply rate limiting
        self._random_delay()
        
        # Rotate user-agent for each request
        self._rotate_user_agent()
        
        # Rotate proxy if configured
        if self.use_proxy and self.proxy_list:
            self._rotate_proxy()
            kwargs['proxies'] = {
                'http': self.current_proxy,
                'https': self.current_proxy
            }
        
        # Add small random timeout to mimic network variability
        kwargs['timeout'] = kwargs.get('timeout', random.uniform(15, 25))
        
        try:
            response = self.session.request(method, url, **kwargs)
            response.raise_for_status()
            
            logger.info(f"[{self.worker_id}] Successfully fetched {url} (Status: {response.status_code})")
            return response
            
        except requests.exceptions.RequestException as e:
            logger.error(f"[{self.worker_id}] Request failed for {url}: {e}")
            
            # If we get a 429 (Too Many Requests), add extra delay
            if hasattr(e, 'response') and e.response and e.response.status_code == 429:
                logger.warning(f"[{self.worker_id}] Rate limited (429). Adding extra delay.")
                time.sleep(random.uniform(10, 20))
            
            return None
    
    def _extract_prices(self, html: str, drug_name: str, strength: str, quantity: int) -> List[Dict[str, Any]]:
        """
        Extract price information from GoodRx HTML.
        
        Args:
            html: HTML content from GoodRx
            drug_name: Original drug name
            strength: Drug strength
            quantity: Quantity requested
            
        Returns:
            List of price dictionaries in TransparentRx format
        """
        prices = []
        soup = BeautifulSoup(html, 'html.parser')
        
        try:
            # Look for pharmacy price cards - these selectors will need updating based on actual GoodRx structure
            # This is a best-guess based on common GoodRx patterns
            price_cards = soup.find_all('div', class_=re.compile(r'pharmacy-card|price-card|pharmacy-result'))
            
            if not price_cards:
                # Alternative: look for table rows
                price_cards = soup.find_all('tr', class_=re.compile(r'pharmacy-row|price-row'))
            
            for card in price_cards[:20]:  # Limit to first 20 results
                try:
                    # Extract pharmacy name
                    pharmacy_name = None
                    name_elem = card.find(['h3', 'h4', 'span', 'div'], class_=re.compile(r'pharmacy-name|store-name|pharmacy-title'))
                    if name_elem:
                        pharmacy_name = name_elem.get_text(strip=True)
                    
                    if not pharmacy_name:
                        continue
                    
                    # Extract cash price
                    cash_price = None
                    cash_elem = card.find(['span', 'div'], class_=re.compile(r'cash-price|regular-price|retail-price'))
                    if cash_elem:
                        price_text = cash_elem.get_text(strip=True)
                        # Extract number from price text (e.g., "$10.99" -> 10.99)
                        price_match = re.search(r'\$?(\d+\.?\d*)', price_text)
                        if price_match:
                            cash_price = float(price_match.group(1))
                    
                    if not cash_price:
                        continue
                    
                    # Extract coupon/discount price if available
                    coupon_price = cash_price
                    coupon_elem = card.find(['span', 'div'], class_=re.compile(r'coupon-price|discount-price|price-with-coupon'))
                    if coupon_elem:
                        price_text = coupon_elem.get_text(strip=True)
                        price_match = re.search(r'\$?(\d+\.?\d*)', price_text)
                        if price_match:
                            coupon_price = float(price_match.group(1))
                    
                    # Determine price type
                    price_type = "coupon" if coupon_price < cash_price else "cash"
                    
                    # Extract pharmacy chain (simplified - just use pharmacy name for now)
                    pharmacy_chain = pharmacy_name
                    
                    # Create price entry in TransparentRx format
                    price_entry = {
                        "pharmacy_name": pharmacy_name,
                        "pharmacy_chain": pharmacy_chain,
                        "cash_price": cash_price,
                        "coupon_price": coupon_price,
                        "price_type": price_type,
                        "source": "GoodRx",
                        "raw_data": {
                            "drug_name": drug_name,
                            "strength": strength,
                            "quantity": quantity
                        }
                    }
                    
                    prices.append(price_entry)
                    
                except Exception as e:
                    logger.debug(f"[{self.worker_id}] Error extracting price from card: {e}")
                    continue
            
            logger.info(f"[{self.worker_id}] Extracted {len(prices)} prices from GoodRx")
            
        except Exception as e:
            logger.error(f"[{self.worker_id}] Error parsing GoodRx HTML: {e}")
        
        return prices
    
    def scrape_drug(self, drug_name: str, strength: str, quantity: int, zip_code: str) -> List[Dict[str, Any]]:
        """
        Scrape price information for a specific drug from GoodRx.
        
        Args:
            drug_name: Name of the drug
            strength: Drug strength (e.g., "10mg")
            quantity: Quantity (e.g., 30)
            zip_code: ZIP code for location-based pricing
            
        Returns:
            List of price dictionaries in TransparentRx format
        """
        logger.info(f"[{self.worker_id}] Scraping GoodRx for {drug_name} {strength} x{quantity} @ {zip_code}")
        
        # Format drug name for URL (e.g., "Metformin" -> "metformin")
        url_drug = drug_name.lower().strip()
        url_drug = re.sub(r'[^a-z0-9]+', '-', url_drug)
        
        # Format strength for URL (e.g., "10mg" -> "10-mg")
        url_strength = strength.lower().strip()
        url_strength = re.sub(r'([0-9]+)([a-z]+)', r'\1-\2', url_strength)
        
        # Construct search URL
        if strength and quantity:
            # Specific drug with strength and quantity
            search_url = f"{self.base_url}/{url_drug}/{url_strength}"
        else:
            # General drug search
            search_url = f"{self.base_url}/{url_drug}"
        
        # Add ZIP code parameter
        search_url += f"?zip={zip_code}"
        
        # Make request with anti-detection measures
        response = self._make_request(search_url)
        
        if not response:
            logger.warning(f"[{self.worker_id}] No response from GoodRx for {drug_name}")
            return []
        
        # Extract prices from HTML
        prices = self._extract_prices(response.text, drug_name, strength, quantity)
        
        # Add ZIP code to each price entry
        for price in prices:
            price['zip_code'] = zip_code
        
        logger.info(f"[{self.worker_id}] GoodRx returned {len(prices)} prices for {drug_name}")
        return prices


# Module-level function for compatibility with cloud_worker.py
def scrape_goodrx(job: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Main entry point for cloud_worker.py integration.
    
    Args:
        job: Job dictionary containing drug_name, strength, quantity, zip_code
        
    Returns:
        List of price dictionaries
    """
    worker_id = job.get('worker_id', 'unknown')
    
    # Extract job parameters
    drug_name = job.get('drug_name', '')
    strength = job.get('strength', '')
    quantity = job.get('quantity', 0)
    zip_code = job.get('zip_code', '')
    
    if not all([drug_name, strength, quantity, zip_code]):
        logger.error(f"[{worker_id}] Missing required job parameters: {job}")
        return []
    
    # Initialize scraper with anti-detection settings
    # Note: You'll need to configure residential proxies in production
    scraper = GoodRxScraper(
        use_proxy=False,  # Set to True and add proxy_list in production
        proxy_list=[],    # Add residential proxies here
        respect_robots=True,
        min_delay=3.0,
        max_delay=5.0,
        worker_id=worker_id
    )
    
    try:
        # Perform scraping
        prices = scraper.scrape_drug(drug_name, strength, quantity, zip_code)
        
        # Log results
        if prices:
            logger.info(f"[{worker_id}] GoodRx scrape successful: {len(prices)} prices found")
        else:
            logger.info(f"[{worker_id}] GoodRx scrape completed: no prices found")
        
        return prices
        
    except Exception as e:
        logger.error(f"[{worker_id}] GoodRx scrape failed: {e}")
        return []


# Configuration helper for setting up residential proxies
def configure_goodrx_scraper(proxy_list: List[str] = None, **kwargs) -> GoodRxScraper:
    """
    Helper function to configure the GoodRx scraper with custom settings.
    
    Args:
        proxy_list: List of residential proxy URLs
        **kwargs: Additional scraper parameters
        
    Returns:
        Configured GoodRxScraper instance
    """
    return GoodRxScraper(
        use_proxy=bool(proxy_list),
        proxy_list=proxy_list or [],
        **kwargs
    )


# Test function
if __name__ == "__main__":
    # Test the scraper with a sample job
    test_job = {
        "worker_id": "test",
        "drug_name": "Metformin",
        "strength": "500mg",
        "quantity": 30,
        "zip_code": "10001"
    }
    
    print("Testing GoodRx scraper...")
    results = scrape_goodrx(test_job)
    print(f"Found {len(results)} prices:")
    for price in results:
        print(f"  {price['pharmacy_name']}: ${price['cash_price']} (${price['coupon_price']} with coupon)")