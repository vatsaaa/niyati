// Ensure React.act is available for test utils that expect it (act-compat)
import * as React from 'react'
import { act as reactAct } from 'react'

if (!React.act) {
  // some libs expect React.act to exist on the default React export
  React.act = reactAct
}

// export nothing; this file is executed for side-effects only
