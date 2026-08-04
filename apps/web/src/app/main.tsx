import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { WikiApplication } from '@coconut-studio/wiki-web'
import '@coconut-studio/wiki-web/styles.css'
import '../brand/star-prison.css'

import './browser-global'
import { starPrisonBrand } from '../brand/star-prison'

const root = document.getElementById('root')
if (!root) throw new Error('Wiki root element was not found')

document.title = starPrisonBrand.productName
createRoot(root).render(
    <StrictMode>
        <WikiApplication brand={starPrisonBrand} />
    </StrictMode>
)
