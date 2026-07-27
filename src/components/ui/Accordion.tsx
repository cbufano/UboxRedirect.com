import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface AccordionItem {
  id: string
  question: string
  answer: string
}

interface AccordionProps {
  items: AccordionItem[]
}

export function Accordion({ items }: AccordionProps) {
  const [openId, setOpenId] = useState<string | null>(null)

  const toggle = (id: string) => {
    setOpenId((current) => (current === id ? null : id))
  }

  return (
    <div className="divide-y divide-slate/10">
      {items.map((item) => {
        const isOpen = openId === item.id
        const panelId = `accordion-panel-${item.id}`

        return (
          <div key={item.id}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggle(item.id)}
              className="flex w-full items-center justify-between gap-4 py-4 text-left font-semibold text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span>{item.question}</span>
              <ChevronDown
                className={`h-5 w-5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {isOpen && (
              <div id={panelId} className="pb-4 text-slate/80">
                {item.answer}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
