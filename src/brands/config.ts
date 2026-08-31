import kashmirLogo from '../assets/logo.png'
import kashmirSidebar from '../assets/sidebar.png'
import kashmirProduct from '../assets/product.png'
import kashmirHealthImg from '../assets/Healthnutrition.png'
import kashmirCookingBenefitsImg from '../assets/cookingbenefits.png'
import kashmirOurProductImg from '../assets/our product.png'
import kashmirWhyChooseUsImg from '../assets/whychooseus.png'
import kashmirPlayNowImg from '../assets/play now.png'
import kashmirSpinnerImg from '../assets/spinner.png'

export type DiscoveryTile = {
  title: string
  image: string
}

export type ShopperSpinConfig = {
  wheel: string
  subtitle: string
  prizeLabels: [string, string, string]
  winAmount: string
  winDetail: string
  promoCode: string
}

export type BaGoalProduct = {
  src: string
  alt: string
  position?: string
  scale?: string
}

export type BrandConfig = {
  label: string
  productName: string
  tagline: string
  logo: string
  sidebar: string
  shopperProduct: string
  shopperHeadline: [string, string]
  shopperDiscoveryTitle: string
  shopperDiscoveryTiles: DiscoveryTile[]
  shopperPlayNow: string
  shopperSpin: ShopperSpinConfig
  baGoalProducts: BaGoalProduct[]
  loginEmail: string
  sidebarOverlay: string
}

export const brand: BrandConfig = {
  label: 'Kashmir',
  productName: 'Kashmir Cooking Oil',
  tagline: 'Better Cooking. Better Choices.',
  logo: kashmirLogo,
  sidebar: kashmirSidebar,
  shopperProduct: kashmirProduct,
  shopperHeadline: ['Better Cooking.', 'Better Choices.'],
  shopperDiscoveryTitle: 'Discover Kashmir Cooking Oil',
  shopperDiscoveryTiles: [
    { title: 'Health & Nutrition', image: kashmirHealthImg },
    { title: 'Cooking Benefits', image: kashmirCookingBenefitsImg },
    { title: 'Our Products', image: kashmirOurProductImg },
    { title: 'Why Choose Us', image: kashmirWhyChooseUsImg },
  ],
  shopperPlayNow: kashmirPlayNowImg,
  shopperSpin: {
    wheel: kashmirSpinnerImg,
    subtitle: 'Exciting rewards await you!',
    prizeLabels: ['You could win 10% OFF', 'Free Sample', 'Rs. 100 Coupon'],
    winAmount: 'Rs. 100 OFF',
    winDetail: 'on your next Kashmir Cooking Oil 1L purchase',
    promoCode: 'BRAND100',
  },
  baGoalProducts: [
    { src: kashmirProduct, alt: 'Kashmir Premium Gold pouch', position: '22% center', scale: '1.25' },
    { src: kashmirOurProductImg, alt: 'Kashmir sunflower oil', position: '12% center', scale: '1.4' },
    { src: kashmirWhyChooseUsImg, alt: 'Kashmir Banaspati Gold', position: '55% center', scale: '1.3' },
  ],
  loginEmail: 'headoffice@kashmir.pk',
  sidebarOverlay: 'from-navy-900/30 via-navy-900/20 to-navy-900/85',
}
