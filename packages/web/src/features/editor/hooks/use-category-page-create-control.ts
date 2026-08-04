import { useEffect } from 'react'

const CATEGORY_MENU_LABEL = '카테고리 작업'
const CONTROL_ATTRIBUTE = 'data-create-page-control'

export function useCategoryPageCreateControl(pageId: string): void {
    useEffect(() => {
        let activeCategoryHeader: HTMLElement | null = null

        const rememberCategory = (event: Event) => {
            const target = event.target
            activeCategoryHeader =
                target instanceof Element ? target.closest<HTMLElement>('.page-category-header') : null
        }

        const installControls = () => {
            const menus = document.querySelectorAll<HTMLElement>(
                `.sidebar-context-menu[aria-label="${CATEGORY_MENU_LABEL}"]`
            )

            for (const menu of menus) {
                if (menu.querySelector(`[${CONTROL_ATTRIBUTE}]`)) continue

                const control = createPageControl()
                control.addEventListener('click', (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    createDefaultPage(activeCategoryHeader)
                })
                menu.prepend(control)
            }
        }

        const observer = new MutationObserver(installControls)
        document.addEventListener('contextmenu', rememberCategory, true)
        observer.observe(document.body, { childList: true, subtree: true })
        installControls()

        return () => {
            document.removeEventListener('contextmenu', rememberCategory, true)
            observer.disconnect()
            document.querySelectorAll(`[${CONTROL_ATTRIBUTE}]`).forEach((control) => control.remove())
        }
    }, [pageId])
}

function createPageControl(): HTMLButtonElement {
    const button = document.createElement('button')
    const icon = document.createElement('span')
    const label = document.createElement('span')

    button.type = 'button'
    button.setAttribute(CONTROL_ATTRIBUTE, 'true')
    button.setAttribute('role', 'menuitem')
    icon.setAttribute('aria-hidden', 'true')
    icon.textContent = '+'
    label.textContent = '새 페이지 추가'
    button.append(icon, label)

    return button
}

function createDefaultPage(categoryHeader: HTMLElement | null): void {
    const addControl = categoryHeader?.querySelector<HTMLElement>('.page-category-add')
    if (!addControl) return

    addControl.click()
}
